groupRouter.post("/:groupId/badges", authenticateByToken, async (req, res, next) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const { badgeType, badgeName, badgeImageUrl } = req.body;

    const badge = await prisma.badge.create({
      data: {
        groupId,
        badgeType,
        badgeName,
        badgeImageUrl,
      },
    });

    // 배지 개수 증가
    await prisma.group.update({
      where: { groupId },
      data: { badgeCount: { increment: 1 } }
    });

    res.status(201).json(createResponse("success", "배지가 추가되었습니다.", badge));
  } catch (error) {
    next(error);
  }
});

groupRouter.delete("/:groupId/badges/:badgeId", authenticateByToken, async (req, res, next) => {
  try {
    const { groupId, badgeId } = req.params;

    const badge = await prisma.badge.findUnique({ where: { badgeId: parseInt(badgeId) } });
    if (!badge) {
      return res.status(404).json(createResponse("not_found", "존재하지 않는 배지입니다.", {}));
    }

    await prisma.badge.delete({ where: { badgeId: parseInt(badgeId) } });

    // 배지 개수 감소
    await prisma.group.update({
      where: { groupId: parseInt(groupId) },
      data: { badgeCount: { decrement: 1 } }
    });

    res.status(200).json(createResponse("success", "배지가 삭제되었습니다.", {}));
  } catch (error) {
    next(error);
  }
});
