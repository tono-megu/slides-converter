import { NextRequest, NextResponse } from 'next/server';
import MarkdownIt from 'markdown-it';
import pptxgen from 'pptxgenjs';

interface SlideContent {
  title: string;
  content: string[];
  level: number;
}

function parseMarkdownToSlides(markdown: string): SlideContent[] {
  // Marp用のFrontmatterやstyleタグを事前に除去
  const cleanedMarkdown = markdown
    .replace(/^---[\s\S]*?---/, '') // 先頭のfrontmatterのみ除去
    .replace(/<style>[\s\S]*?<\/style>/g, '') // styleブロックを除去
    .trim();

  // --- を区切り文字として、各スライドのMarkdown文字列に分割
  const slideSections = cleanedMarkdown.split(/\n---\n/);

  const slides: SlideContent[] = slideSections.map(section => {
    const trimmedSection = section.trim();
    const lines = trimmedSection.split('\n');
    
    let title = '';
    let contentLines: string[] = [];
    let titleFound = false;

    // 最初の見出しを探してタイトルに設定
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('#') && !titleFound) {
        title = line.replace(/^#+\s*/, '').trim();
        titleFound = true;
      } else {
        contentLines.push(line);
      }
    }

    // もし見出しが一つも見つからなければ、最初の行をタイトルにする
    if (!titleFound && lines.length > 0) {
      title = lines[0];
      contentLines = lines.slice(1);
    }

    // 本文を一つの文字列にまとめる
    const content = contentLines.join('\n').trim();

    return {
      title: title || ' ',
      content: [content],
      level: 1, // レベルは一旦1に固定
    };
  }).filter(slide => slide.title.trim() !== '' || slide.content[0].trim() !== ''); // 空のスライドを除去

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