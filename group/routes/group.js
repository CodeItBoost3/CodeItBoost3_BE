import express from "express";
import { prisma } from "../../app.js";
import { CreateGroupStruct, UpdateGroupStruct } from "../groupStructs.js";
import { assert } from "superstruct";

const groupRouter = express.Router();

// 1. 그룹 생성
groupRouter.post("/", async (req, res, next) => {
    try {
        assert(req.body, CreateGroupStruct);

        const group = await prisma.group.create({
            data: {
                groupName: req.body.name,
                groupPassword: req.body.password,
                imageUrl: req.body.imageUrl,
                isPublic: req.body.isPublic,
                groupDescription: req.body.introduction,
                members: {
                    create: {
                        user: { connect: { id: req.body.userId } },
                        role: "ADMIN",
                    },
                },
            },
        });

        res.status(201).json(createResponse("success", "그룹이 생성되었습니다.", group));
    } catch (error) {
        next(error);
    }
});

// 2. 그룹 이름 검색
groupRouter.get("/search", async (req, res, next) => {
    try {
        const { keyword } = req.query;

        const groups = await prisma.group.findMany({
            where: {
                groupName: keyword ? { contains: keyword.toLowerCase() } : undefined,
            },
        });

        res.status(200).json(createResponse("success", "그룹 검색 성공", groups));
    } catch (error) {
        next(error);
    }
});

// 3. 그룹 상세 조회
groupRouter.get("/:groupId", async (req, res, next) => {
    try {
        const groupId = parseInt(req.params.groupId);

        const group = await prisma.group.findUnique({
            where: { groupId },
        });

        if (!group) return res.status(404).json(createResponse("not_found", "존재하지 않는 그룹입니다.", {}));

        res.status(200).json(createResponse("success", "그룹 상세 조회 성공", group));
    } catch (error) {
        next(error);
    }
});

// 4. 그룹 목록 조회
groupRouter.get("/", async (req, res, next) => {
    try {
        const { sortBy, keyword, isPublic } = req.query;

        let orderBy = { createdAt: "desc" };
        switch (sortBy) {
            case "latest":
                orderBy = { createdAt: "desc" };
                break;
            case "mostPosted":
                orderBy = { postCount: "desc" };
                break;
            case "mostLiked":
                orderBy = { likeCount: "desc" };
                break;
            case "mostBadge":
                orderBy = { badgeCount: "desc" };
                break;
        }

        const groups = await prisma.group.findMany({
            where: {
                groupName: keyword ? { contains: keyword.toLowerCase() } : undefined,
                isPublic: isPublic === "true" ? true : isPublic === "false" ? false : undefined,
            },
            orderBy,
        });

        res.status(200).json(createResponse("success", "그룹 목록 조회 성공", groups));
    } catch (error) {
        next(error);
    }
});

// 5. 그룹 수정 (8. 비밀번호 검증 필요. 프론트에서 먼저 호출하는 것 가정하고 구현하였습니다)
groupRouter.patch("/:groupId", async (req, res, next) => {
    try {
        assert(req.body, UpdateGroupStruct);

        const groupId = parseInt(req.params.groupId);

        const existingGroup = await prisma.group.findUnique({ where: { groupId } });

        if (!existingGroup) {
            return res.status(404).json(createResponse("not_found", "그룹을 찾을 수 없습니다."));
        }

        // 그룹 수정 진행
        const updatedGroup = await prisma.group.update({
            where: { groupId },
            data: {
                groupName: req.body.name,
                groupPassword: req.body.password,
                imageUrl: req.body.imageUrl,
                isPublic: req.body.isPublic,
                groupDescription: req.body.introduction,
            },
        });

        res.status(200).json(createResponse("success", "그룹이 성공적으로 수정되었습니다.", updatedGroup));
    } catch (error) {
        next(error);
    }
});

// 6. 그룹 삭제 (8. 비밀번호 검증 필요. 프론트에서 먼저 호출하는 것 가정하고 구현하였습니다.)
groupRouter.delete("/:groupId", async (req, res, next) => {
    try {
        const groupId = parseInt(req.params.groupId);

        const group = await prisma.group.findUnique({ where: { groupId } });

        if (!group) return res.status(404).json(createResponse("not_found", "존재하지 않는 그룹입니다.", {}));

        await prisma.groupMember.deleteMany({ where: { groupId } });
        await prisma.group.delete({ where: { groupId } });

        res.status(200).json(createResponse("success", "그룹이 삭제되었습니다.", {}));
    } catch (error) {
        next(error);
    }
});

// 7. 그룹 공개 여부 확인
groupRouter.get("/:groupId/is-public", async (req, res, next) => {
    try {
        const group = await prisma.group.findUnique({
            where: { groupId: parseInt(req.params.groupId) },
            select: { isPublic: true },
        });

        if (!group) return res.status(404).json(createResponse("not_found", "존재하지 않는 그룹입니다.", {}));

        res.status(200).json(createResponse("success", "그룹 공개 여부 조회 성공", group));
    } catch (error) {
        next(error);
    }
});

// 8. 비밀번호 검증
groupRouter.post("/:groupId/verify-password", async (req, res, next) => {
    try {
        const groupId = parseInt(req.params.groupId);
        const { password } = req.body;

        const group = await prisma.group.findUnique({ where: { groupId } });

        if (!group) return res.status(404).json(createResponse("not_found", "존재하지 않는 그룹입니다.", {}));
        if (group.groupPassword !== password) return res.status(403).json(createResponse("unauthorized", "비밀번호가 틀렸습니다.", {}));

        res.status(200).json(createResponse("success", "비밀번호가 확인되었습니다.", {}));
    } catch (error) {
        next(error);
    }
});

function createResponse(status, message, data) {
    return {
        status,
        message,
        data,
    };
}

export default groupRouter;
