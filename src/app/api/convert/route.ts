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

  // ---, #, ##, ### を区切り文字としてセクションに分割
  // 正規表現の(?=...)は「肯定先読み」で、区切り文字自体をセクションの先頭に残す
  const sections = cleanedMarkdown.split(/\n(?=---|# |## |### )/);

  const slides: SlideContent[] = [];

  sections.forEach(section => {
    const trimmedSection = section.trim();
    if (trimmedSection === '') {
      return; // 空のセクションはスキップ
    }

    const lines = trimmedSection.split('\n');
    let title = '';
    let contentLines: string[] = [];
    
    // ---だけの行の場合は、次の行以降を処理
    if (lines[0] === '---') {
      // ---の次の行が見出しの場合
      if (lines.length > 1 && lines[1].startsWith('#')) {
        title = lines[1].replace(/^#+\s*/, '').trim();
        contentLines = lines.slice(2);
      } else if (lines.length > 1) {
        // ---の次の行をタイトルとする
        title = lines[1];
        contentLines = lines.slice(2);
      } else {
        title = 'スライド';
        contentLines = [];
      }
    }
    // 最初の行が見出しであれば、それをタイトルとして抽出
    else if (lines[0].startsWith('#')) {
      title = lines[0].replace(/^#+\s*/, '').trim();
      contentLines = lines.slice(1);
    } else {
      // 見出しがない場合は、最初の行をタイトルとし、残りを内容とする
      title = lines[0] || 'スライド';
      contentLines = lines.slice(1);
    }

    // 全てのコンテンツを保持（空行も含めて）
    const content = contentLines.join('\n');

    // タイトルまたはコンテンツがある場合のみスライドを追加
    if (title.trim() || content.trim()) {
      slides.push({
        title: title || 'スライド',
        content: [content], // 空でもコンテンツを保持
        level: (lines[0].match(/#/g) || []).length || 1,
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