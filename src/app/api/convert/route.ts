import { NextRequest, NextResponse } from 'next/server';
import MarkdownIt from 'markdown-it';
import pptxgen from 'pptxgenjs';

interface SlideContent {
  title: string;
  content: string[];
  level: number;
}

function parseMarkdownToSlides(markdown: string): SlideContent[] {
  // 1. Markdown全体を "---" で分割して、各スライドの塊に分ける
  const slideSections = markdown.split(/\n---\n/);

  const slides: SlideContent[] = [];

  slideSections.forEach(section => {
    const trimmedSection = section.trim();
    if (trimmedSection === '') {
      return; // 空のセクションはスキップ
    }

    const lines = trimmedSection.split('\n');
    let title = '';
    let contentLines: string[] = [];
    let titleFound = false;

    // 2. 各スライドの最初の見出し（# や ##）をタイトルとして探し、残りを内容とする
    for (const line of lines) {
      if (line.startsWith('#') && !titleFound) {
        title = line.replace(/#/g, '').trim();
        titleFound = true;
      } else {
        contentLines.push(line);
      }
    }

    // 3. もし見出しがなければ、最初の行をタイトルとする
    if (!titleFound && lines.length > 0) {
      title = lines[0].trim();
      contentLines = lines.slice(1);
    }
    
    // HTMLタグを簡易的に除去（不要なタグがPPTXに出力されるのを防ぐ）
    const cleanedContent = contentLines.join('\n')
      .replace(/<div.*?>/g, '')
      .replace(/<\/div>/g, '')
      .replace(/<strong.*?>/g, '')
      .replace(/<\/strong>/g, '')
      .replace(/<br>/g, '\n')
      .trim();

    slides.push({
      title: title || ' ', // タイトルが空の場合はスペースを入れる
      content: [cleanedContent], // 全ての内容を一つのテキストブロックとして格納
      level: 1 
    });
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