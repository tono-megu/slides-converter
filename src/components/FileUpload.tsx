'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

export default function FileUpload() {
  const [isConverting, setIsConverting] = useState(false);
  const [message, setMessage] = useState('');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    
    if (!file) return;

    if (!file.name.endsWith('.md')) {
      setMessage('.mdファイルをアップロードしてください');
      return;
    }

    setIsConverting(true);
    setMessage('変換中...');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/convert', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '変換に失敗しました');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name.replace('.md', '.pptx');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage('変換が完了しました！ダウンロードを開始します。');
    } catch (error) {
      setMessage(`エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsConverting(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/markdown': ['.md']
    },
    multiple: false
  });

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">
        マークダウン → パワーポイント 変換ツール
      </h1>
      
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        } ${isConverting ? 'pointer-events-none opacity-50' : ''}`}
      >
        <input {...getInputProps()} />
        
        <div className="text-6xl mb-4">📄</div>
        
        {isConverting ? (
          <div>
            <div className="text-lg font-medium text-gray-700 mb-2">変換中...</div>
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
          </div>
        ) : isDragActive ? (
          <div className="text-lg font-medium text-blue-600">
            マークダウンファイルをここにドロップしてください...
          </div>
        ) : (
          <div>
            <div className="text-lg font-medium text-gray-700 mb-2">
              .mdファイルをここにドラッグ&ドロップ
            </div>
            <div className="text-gray-500">またはクリックしてファイルを選択</div>
          </div>
        )}
      </div>

      {message && (
        <div className={`mt-4 p-4 rounded-lg text-center ${
          message.includes('Error') 
            ? 'bg-red-50 text-red-700 border border-red-200'
            : 'bg-green-50 text-green-700 border border-green-200'
        }`}>
          {message}
        </div>
      )}

      <div className="mt-8 text-sm text-gray-600">
        <h3 className="font-semibold mb-2">使い方:</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>マークダウンファイル(.md)をアップロード</li>
          <li>見出し（# ## ###）がスライドタイトルになります</li>
          <li>各見出しの下の内容がスライドの本文になります</li>
          <li>生成されたパワーポイントファイルをダウンロード</li>
        </ul>
      </div>
    </div>
  );
}