import { NextRequest, NextResponse } from 'next/server';
import MarkdownIt from 'markdown-it';
import pptxgen from 'pptxgenjs';

interface SlideContent {
  title: string;
  content: string[];
  level: number;
}

function parseMarkdownToSlides(markdown: string): SlideContent[] {
  const md = new MarkdownIt({ html: true });

  // Marp用のFrontmatterやstyleタグを事前に除去
  const cleanedMarkdown = markdown
    .replace(/^---[\s\S]*?---/, '')
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .trim();

  // 1. まずMarkdown全体を一度にHTMLへ変換する
  const fullHtml = md.render(cleanedMarkdown);

  // 2. --- (HRタグ) でスライドごとのHTMLセクションに分割
  const slideHtmlSections = fullHtml.split('<hr>');

  const slides: SlideContent[] = slideHtmlSections.map(htmlSection => {
    let title = '';
    let contentHtml = htmlSection;

    // 3. 各セクションから最初の見出しタグを探してタイトルとする
    const headingMatch = htmlSection.match(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/);
    if (headingMatch) {
      title = headingMatch[2].trim();
      // タイトルにした見出しタグを本文から削除
      contentHtml = contentHtml.replace(headingMatch[0], '');
    }

    // 4. 残りのHTMLから全てのタグを除去して本文とする
    const plainTextContent = contentHtml
      .replace(/<[^>]*>/g, ' ') // 全てのHTMLタグをスペースに置換
      .replace(/\s+/g, ' ') // 連続する空白を一つにまとめる
      .trim();

    return {
      title: title || ' ', // タイトルがなければスペース
      content: [plainTextContent],
      level: headingMatch ? parseInt(headingMatch[1], 10) : 1,
    };
  }).filter(slide => slide.title.trim() !== '' || slide.content[0].trim() !== ''); // 完全に空のスライドを除去

  return slides;
}

async function createPPTX(slides: SlideContent[]): Promise<Buffer> {
  const pptx = new pptxgen();

  // Title slide
  const titleSlide = pptx.addSlide();
  titleSlide.background = { fill: '2E86AB' };
  titleSlide.addText('マークダウンから生成', {
    x: 1,
    y: 2,
    w: 8,
    h: 1,
    fontSize: 36,
    color: 'FFFFFF',
    bold: true,
    align: 'center'
  });

  // Content slides
  slides.forEach((slide, index) => {
    const pptxSlide = pptx.addSlide();
    pptxSlide.background = { fill: 'F3F4F6' };

    // Title
    pptxSlide.addText(slide.title, {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 1,
      fontSize: 28,
      color: '1F2937',
      bold: true
    });

    // Content
    if (slide.content.length > 0) {
      const contentText = slide.content.join('\n\n');
      pptxSlide.addText(contentText, {
        x: 0.5,
        y: 1.8,
        w: 9,
        h: 4,
        fontSize: 18,
        color: '374151'
      });
    }
  });

  // 変更点：PromiseベースのAPIを直接呼び出す
  const pptxBuffer = await pptx.write('nodebuffer');
  return pptxBuffer as Buffer;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'ファイルがアップロードされていません' }, { status: 400 });
    }

    if (!file.name.endsWith('.md')) {
      return NextResponse.json({ error: '.mdファイルをアップロードしてください' }, { status: 400 });
    }

    let markdown = await file.text();

    // MarpのFrontmatterとstyleブロックを事前に除去して、
    // 純粋なMarkdownコンテンツのみをパーサーに渡す
    markdown = markdown
      .replace(/---[\s\S]*?---/, '') // Frontmatterを除去
      .replace(/<style>[\s\S]*?<\/style>/, ''); // styleブロックを除去

    const slides = parseMarkdownToSlides(markdown);

    if (slides.length === 0) {
      return NextResponse.json({ error: 'マークダウンファイルに有効なスライドが見つかりません' }, { status: 400 });
    }

    const pptxBuffer = await createPPTX(slides);

    return new NextResponse(pptxBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="${file.name.replace('.md', '.pptx')}"`,
      },
    });
  } catch (error) {
    console.error('マークダウンからPPTXへの変換エラー:', error);
    return NextResponse.json({ error: 'サーバー内部エラー' }, { status: 500 });
  }
}