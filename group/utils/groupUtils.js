export function calculateDday(createdAt) {
  const createdDate = new Date(createdAt);
  const today = new Date();
  const diffTime = today - createdDate;
  return `D+${Math.floor(diffTime / (1000 * 60 * 60 * 24))}`;
}

export const badgeNames = {
  LIKE_20: "공감 20회 달성하기",
  LIKE_40: "공감 40회 달성하기",
  LIKE_60: "공감 60회 달성하기",
  LIKE_80: "공감 80회 달성하기",
  LIKE_100: "공감 100회 달성하기",
  MEMBER_10: "멤버 10명 모으기",
  MEMBER_20: "멤버 20명 모으기",
  MEMBER_30: "멤버 30명 모으기",
  MEMBER_40: "멤버 40명 모으기",
  MEMBER_50: "멤버 50명 돌파기",
  MEMORY_10: "추억 10개 등록하기",
  MEMORY_20: "추억 20개 등록하기",
  MEMORY_30: "추억 30개 등록하기",
  MEMORY_40: "추억 40개 등록하기",
  MEMORY_50: "추억 50개 등록하기",
};

export async function updateBadgesForGroup(prisma, groupId) {
  const group = await prisma.group.findUnique({
    where: { groupId },
    include: {
      posts: true,
      members: true,
      badges: {
        select: {
          badgeType: true, // 명확하게 선택
        },
      },
    },
  });

  if (!group) return;

  const totalLikeCount = group.groupLikeCount + group.posts.reduce((sum, post) => sum + post.likeCount, 0);
  const memberCount = group.members.length;
  const postCount = group.posts.length;

  const badgeTiers = {
    LIKE: ["LIKE_20", "LIKE_40", "LIKE_60", "LIKE_80", "LIKE_100"],
    MEMBER: ["MEMBER_10", "MEMBER_20", "MEMBER_30", "MEMBER_40", "MEMBER_50"],
    MEMORY: ["MEMORY_10", "MEMORY_20", "MEMORY_30", "MEMORY_40", "MEMORY_50"],
  };

  const latestBadges = {
    LIKE: null,
    MEMBER: null,
    MEMORY: null,
  };

  for (const type of badgeTiers.LIKE) {
    if (totalLikeCount >= parseInt(type.split("_")[1])) latestBadges.LIKE = type;
  }

  for (const type of badgeTiers.MEMBER) {
    if (memberCount >= parseInt(type.split("_")[1])) latestBadges.MEMBER = type;
  }

  for (const type of badgeTiers.MEMORY) {
    if (postCount >= parseInt(type.split("_")[1])) latestBadges.MEMORY = type;
  }

  const existingBadges = group.badges.map(b => b.badgeType);

  for (const [category, latestBadge] of Object.entries(latestBadges)) {
    if (!latestBadge) continue;

    if (!existingBadges.includes(latestBadge)) {
      await prisma.badge.create({
        data: {
          groupId,
          badgeType: latestBadge,
          badgeName: badgeNames[latestBadge] || "다양한 활동으로 새로운 배지를 얻어보세요!",
        },
      });

      await prisma.group.update({
        where: { groupId },
        data: { badgeCount: { increment: 1 } },
      });
    }
  }
}

