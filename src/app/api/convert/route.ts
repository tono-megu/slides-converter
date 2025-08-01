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
    .replace(/---[\s\S]*?---/, '')
    .replace(/<style>[\s\S]*?<\/style>/, '')
    .trim();

  // H2見出し（##）を区切り文字として、テキスト全体をセクションに分割
  // (?=## )という正規表現を使うことで、##自体は各セクションの先頭に残す
  const sections = cleanedMarkdown.split(/\n(?=## )/);

  const slides: SlideContent[] = [];

  sections.forEach((section, index) => {
    const trimmedSection = section.trim();
    if (trimmedSection === '') return;

    const lines = trimmedSection.split('\n');
    let title = '';
    let contentLines: string[] = [];

    // 最初のセクションで、かつH1見出しがある場合は、それをタイトルスライドとして扱う
    if (index === 0 && lines[0].startsWith('# ')) {
      title = lines[0].replace(/^# /, '').trim();
      // H2が続く場合、それもタイトルに含める
      if (lines.length > 1 && lines[1].startsWith('## ')) {
        title += `\n${lines[1].replace(/^## /, '').trim()}`;
        contentLines = lines.slice(2);
      } else {
        contentLines = lines.slice(1);
      }
    } 
    // H2見出しで始まるセクションの処理
    else if (lines[0].startsWith('## ')) {
      title = lines[0].replace(/^## /, '').trim();
      contentLines = lines.slice(1);
    } 
    // それ以外の予期せぬセクションは、最初の行をタイトルとして扱う
    else {
      title = lines[0];
      contentLines = lines.slice(1);
    }

    const content = contentLines.join('\n').trim();

    if (title || content) {
      slides.push({
        title: title || ' ',
        content: [content],
        level: title.startsWith('# ') ? 1 : 2,
      });
    }
  });

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