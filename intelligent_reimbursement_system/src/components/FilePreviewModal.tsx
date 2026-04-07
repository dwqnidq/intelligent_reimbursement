import { Modal, Image, Spin, Button } from 'antd'
import { useState } from 'react'

interface Props {
  url: string | null
  mimeType?: string   // 本地文件传 file.type，远程文件靠 URL 后缀判断
  onClose: () => void
}

function isImage(url: string, mimeType?: string) {
  if (mimeType) return mimeType.startsWith('image/')
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(url)
}

function isPdf(url: string, mimeType?: string) {
  if (mimeType) return mimeType === 'application/pdf'
  return /\.pdf(\?|$)/i.test(url)
}

function PdfViewer({ url }: { url: string }) {
  const [loading, setLoading] = useState(true)

  return (
    <div className="relative" style={{ height: '75vh' }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <Spin tip="加载中..." />
        </div>
      )}
      <iframe
        src={url}
        className="w-full h-full border-0"
        onLoad={() => setLoading(false)}
        title="PDF 预览"
      />
    </div>
  )
}

export default function FilePreviewModal({ url, mimeType, onClose }: Props) {
  if (!url) return null

  const image = isImage(url, mimeType)
  const pdf = isPdf(url, mimeType)

  return (
    <Modal
      open={!!url}
      onCancel={onClose}
      footer={null}
      width={image ? 'auto' : 900}
      styles={{ body: { padding: 0, minHeight: 200 } }}
      centered
      destroyOnClose
    >
      {/* 图片：使用 Ant Design Image 内置预览，自带滚轮缩放、拖拽、旋转 */}
      {image && (
        <Image
          src={url}
          preview={{
            src: url,
            mask: false,
          }}
          style={{ maxWidth: '80vw', maxHeight: '80vh', display: 'block' }}
          wrapperStyle={{ display: 'block' }}
        />
      )}

      {/* PDF：自定义滚轮缩放 + 拖拽 */}
      {pdf && <PdfViewer url={url} />}

      {!image && !pdf && (
        <div className="py-8 text-center text-gray-400">
          <p className="mb-3">该文件类型不支持预览</p>
          <a href={url} target="_blank" rel="noreferrer" className="text-blue-500">
            点击在新标签页打开
          </a>
        </div>
      )}
    </Modal>
  )
}
