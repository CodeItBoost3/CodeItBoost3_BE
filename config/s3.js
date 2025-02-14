import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { CustomError } from '../error/error.js';

// S3 클라이언트 생성
const s3 = new S3Client({
  region: "ap-northeast-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// S3에 파일 업로드 함수 
export async function uploadToS3(key, file, type) {
  try {
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Body: file,
      ContentType: type,
    });

    await s3.send(command);
    console.log("✅ S3 업로드 성공!");
  } catch (err) {
    throw new CustomError(500, `S3 파일 업로드 실패: ${err.message}`);
  }
}

// S3에서 파일 삭제하는 함수
export async function deleteFromS3(key) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
    });

    await s3.send(command);
    console.log(`✅ S3 파일 삭제 성공: ${key}`);
  } catch (err) {
    throw new CustomError(500, `S3 파일 삭제 실패: ${err.message}`);
  }
}
