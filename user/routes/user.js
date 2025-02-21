import express from 'express';
import { prisma } from '../../app.js';
import { createUser, updateUser } from '../userStructs.js';
import { assert } from 'superstruct';
import bcrypt from 'bcrypt';
import { wrapAsync } from '../../app.js';
import { CustomError } from '../../error/error.js';
import { upload } from '../../config/multer.js';
import { deleteFromS3, uploadToS3 } from '../../config/s3.js';
import moment from 'moment-timezone';
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const iconv = require("iconv-lite");


const userRouter = express.Router();

userRouter.get('/me', wrapAsync(async (req, res, next) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      clientId: true,
      nickname: true,
      profileImageUrl: true,
    }
  })
  user.profileImageUrl = `${process.env.AWS_CLOUD_FRONT_URL}/${user.profileImageUrl}`;
  res.send(createResponse('success', '내 정보 조회에 성공했습니다.', user))
}))

  .post('/', wrapAsync(async (req, res, next) => {
    console.log(req.body);
    try {
      assert(req.body, createUser);
    }
    catch (err) {
      console.error(err.message);
      throw new CustomError(400, '가입하려는 유저 정보가 올바르지 않습니다.');
    }
    const { clientId, password, nickname } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        clientId,
        password: hashedPassword,
        nickname,
      },
      omit: {
        password: true
      }
    });
    res.status(201).send(createResponse('success', '회원가입에 성공했습니다.', user));
  }))

  .patch('/me', wrapAsync(async (req, res) => {
    const id = req.user.id;
    try {
      assert(req.body, updateUser);
    }
    catch (err) {
      throw new CustomError(400, '수정하려는 유저 정보가 올바르지 않습니다.');
    }
    const user = await prisma.user.update({
      where: {
        id
      },
      data: req.body,
      omit: {
        password: true
      }
    });

    res.send(createResponse('success', '정보 수정이 완료되었습니다.', user));
  }))

  .patch('/me/password', wrapAsync(async (req, res) => {
    // 유저 비밀번호 조회
    console.log(req.user);
    const id = req.user.id;
    const { currentPassword, newPassword } = req.body;
    console.log(currentPassword, newPassword);
    const user = await prisma.user.findUnique({
      select: {
        password: true,
      },
      where: {
        id,
      },
    })
    if (!user) {
      throw new CustomError(404, '인증된 유저가 존재하지 않습니다.');
    }

    // 검증
    if (!await bcrypt.compare(currentPassword, user.password)) {
      throw new CustomError(400, '비밀번호가 일치하지 않습니다.');
    }
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // 새 비밀번호 적용
    await prisma.user.update({
      data: {
        password: hashedNewPassword,
      },
      where: {
        id,
      },
    });

    res.send(createResponse('success', '비밀번호 변경에 성공했습니다.', {}));
  }))

  .get('/validation', wrapAsync(async (req, res, next) => {
    const clientId = req.query["client-id"];
    const user = await prisma.user.findUnique({
      where: {
        clientId
      }
    });
    if (user) {
      throw new CustomError(400, '이미 존재하는 ID입니다.');
    }
    else {
      res.send(createResponse('success', '사용 가능한 ID입니다.', {}));
    }

  }))

  .patch('/me/profile-image', upload.single('profile'), wrapAsync(async (req, res) => {
    const id = req.user.id;
    if (!req.file) {
      throw new CustomError(400, '파일이 존재하지 않습니다.');
    }

    const file = req.file;
    const path = "profile_image";
    // ISO-8859-1 → UTF-8 변환
    const utf8FileName = iconv.decode(Buffer.from(file.originalname, "binary"), "ISO-8859-1");
    // UTF-8로 변환된 한글을 Hex 인코딩
    const safeFileName = Buffer.from(utf8FileName, "utf8").toString("hex");
    const fileKey = `${path}/${Date.now()}-${safeFileName}`;



    try {
      // 트랜잭션 시작 (기존 삭제 + 새로운 이미지 업로드 + DB 업데이트)
      await prisma.$transaction(async (tx) => {
        // 기존 프로필 이미지 삭제 (S3에서 삭제)
        const user = await tx.user.findUnique({
          where: { id },
          select: { profileImageUrl: true },
        });

        if (user?.profileImageUrl) {
          await deleteFromS3(user.profileImageUrl);
        }

        // 새 프로필 이미지 업로드 (S3)
        await uploadToS3(fileKey, file.buffer, file.mimetype);
        const publicUrl = `${process.env.AWS_CLOUD_FRONT_URL}/${fileKey}`;
        const s3Url = fileKey;

        // DB에 새로운 프로필 이미지 URL 업데이트
        await tx.user.update({
          data: { profileImageUrl: s3Url },
          where: { id },
        });

        // 클라이언트에게 응답
        res.send(
          createResponse("success", "프로필 이미지가 업데이트 되었습니다.", {
            profileImageUrl: publicUrl,
          })
        );
      });
    } catch (err) {
      throw new CustomError(500, `프로필 업데이트 실패: ${err.message}`);
    }
  }))

  .delete('/me/profile-image', wrapAsync(async (req, res) => {
    const id = req.user.id;
    const user = await prisma.user.findUnique({
      where: { id },
      select: { profileImageUrl: true },
    });
    try {
      if (user?.profileImageUrl) {
        await deleteFromS3(user.profileImageUrl);
        await prisma.user.update({
          where: { id },
          data: {
            profileImageUrl: null
          }
        })
      }
      res.send(createResponse('success', '프로필 사진이 삭제되었습니다.', {}));
    }
    catch (err) {
      throw CustomError(500, `이미지 삭제에 실패했습니다: ${err.message}}`)
    }
  }))

  .get('/me/groups', wrapAsync(async (req, res) => {
    const userId = req.user.id
    const { page = '1', pageSize = '5' } = req.query

    const orderBy = { joinedAt: 'desc' }
    const take = parseInt(pageSize);
    const skip = (parseInt(page) - 1) * take;


    const totalItemCount = await prisma.groupMember.count({
      where: { userId }
    });
    const totalPages = Math.ceil(totalItemCount / take);
    if (totalPages == 0) {
      return res.send(createResponse('success', '소속된 그룹이 존재하지 않습니다.', {
        groups: [],
        currentPage: parseInt(page),
        totalPages,
      }));
    }
    if (totalPages < parseInt(page)) {
      throw new CustomError(404, '존재하지 않는 페이지 입니다.');
    }
    const groups = await prisma.groupMember.findMany({
      where: { userId },
      select: {
        role: true,
        joinedAt: true,
        group: {
          omit:{
            groupPassword: true,
          }
        }
      },
      orderBy,
      take,
      skip
    });

    res.send(createResponse('success', '내가 소속한 그룹 목록을 불러왔습니다.', {
      groups,
      currentPage: parseInt(page),
      totalPages,
    }));
  }))

  .get('/me/posts', wrapAsync(async (req, res) => {
    const userId = req.user.id
    const { page = '1', pageSize = '5' } = req.query

    const orderBy = { createdAt: 'desc' }
    const take = parseInt(pageSize);
    const skip = (parseInt(page) - 1) * take;


    const totalItemCount = await prisma.post.count({
      where: { userId }
    });
    const totalPages = Math.ceil(totalItemCount / take);
    if (totalPages == 0) {
      return res.send(createResponse('success', '작성한 추억이 존재하지 않습니다.', {
        posts: [],
        currentPage: parseInt(page),
        totalPages,
      }));
    }
    if (totalPages < parseInt(page)) {
      throw new CustomError(404, '존재하지 않는 페이지 입니다.');
    }
    const posts = await prisma.post.findMany({
      select: {
        postId: true,
        title: true,
        content: true,
        tag: true,
        moment: true,
        createdAt: true,
        likeCount: true,
        commentCount: true,
        imageUrl: true,
        author: {
          select: {
            nickname: true,
          }
        },
        group: {
          select: {
            groupId: true,
            groupName: true,
            isPublic: true,
          }
        }
      },
      where: {
        userId
      },
      orderBy,
      take,
      skip
    });

    res.send(createResponse('success', '내가 작성한 추억을 불러왔습니다.', {
      posts,
      currentPage: parseInt(page),
      totalPages,
    }));
  }))

  .get('/me/comments', wrapAsync(async (req, res) => {
    const userId = req.user.id
    const { page = '1', pageSize = '5' } = req.query

    const orderBy = { createdAt: 'desc' }
    const take = parseInt(pageSize);
    const skip = (parseInt(page) - 1) * take;

    const totalItemCount = await prisma.comment.count({
      where: { userId }
    });
    const totalPages = Math.ceil(totalItemCount / take);
    if (totalPages == 0) {
      return res.send(createResponse('success', '작성한 댓글이 존재하지 않습니다.', {
        comments: [],
        currentPage: parseInt(page),
        totalPages,
      }));
    }
    if (totalPages < parseInt(page)) {
      throw new CustomError(404, '존재하지 않는 페이지 입니다.');
    }
    const comments = await prisma.comment.findMany({
      select: {
        commentId: true,
        content: true,
        createdAt: true,
        likeCount: true,
        post: {
          select: {
            groupId: true,
            postId: true,
            title: true,
          }
        }
      },
      where: {
        userId
      },
      orderBy,
      take,
      skip
    });

    res.send(createResponse('success', '내가 작성한 댓글을 불러왔습니다.', {
      comments,
      currentPage: parseInt(page),
      totalPages,
    }));
  }))



  .get('/me/notifications', wrapAsync(async (req, res) => {
    const userId = req.user.id;
    const { page = '1', pageSize = '5' } = req.query

    const orderBy = { createdAt: 'desc' }
    const take = parseInt(pageSize);
    const skip = (parseInt(page) - 1) * take;

    const totalItemCount = await prisma.notification.count({
      where: { userId }
    });
    const totalPages = Math.ceil(totalItemCount / take);
    if (totalPages == 0) {
      return res.send(createResponse('success', '알림이 존재하지 않습니다.', {
        notifications: [],
        currentPage: parseInt(page),
        totalPages,
      }));
    }
    if (totalPages < parseInt(page)) {
      throw new CustomError(404, '더 불러올 알림이 없습니다.');
    }
    const notifications = await prisma.notification.findMany({
      where: { userId },
      select:{
        id: true,
        message: {
          select: {
            createdAt: true,
            title: true,
            content: true,
            type: true,
            postId: true,
            groupId: true,
          }
        }
      },
      take,
      skip,
      orderBy,
    });
    console.log(notifications)
    // 데이터 변환: 필요한 필드만 남기고, 시간 포맷 변경
    const transformedNotifications = notifications.map(notification => ({
      id: notification.id,
      groupId: notification.message.groupId,
      time: moment(notification.message.createdAt).format("YYYY-MM-DD HH:mm:ss"),
      title: notification.message.title,
      content: notification.message.content,
      type: notification.message.type,
      postId: notification.message.postId
    }));
    res.send(createResponse('success', '수신받은 알림을 받아왔습니다.', {
      transformedNotifications,
      currentPage: parseInt(page),
      totalPages,
    }));
  }))

  .delete('/me/notifications/:notificationId', wrapAsync(async (req, res) =>{
    const notificationId = parseInt(req.params.notificationId);
    const userId = req.user.id;
    await prisma.notification.delete({
      where: { id: notificationId },
    });
    res.send(createResponse('success', `${notificationId}번 알림을 삭제하였습니다.`, {}));
  }))

  .delete('/me/notifications', wrapAsync(async (req, res) =>{
    const userId = req.user.id;
    await prisma.notification.deleteMany({
      where: { userId },
    });
    res.send(createResponse('success', '알림을 모두 지웠습니다.', {}));
  }));

function createResponse(status, message, data) {
  return {
    status,
    message,
    data,
  };
};


export default userRouter;