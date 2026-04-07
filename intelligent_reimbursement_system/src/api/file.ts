import http from './http'

export interface UploadFileResponse {
  id: string
  url: string
}

export const uploadFile = (file: File, type: string = 'attachment') => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('type', type)
  
  return http.post<UploadFileResponse>('/files/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}
