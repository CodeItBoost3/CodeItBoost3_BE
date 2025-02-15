import multer from 'multer';

// 이미지 파일만 허용하는 필터
const imageFileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith("image/")) {
    return cb(new Error("이미지 파일만 업로드 가능합니다!"), false);
  }
  cb(null, true);
};

// Multer 설정 (메모리 저장)
export const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB 제한
});