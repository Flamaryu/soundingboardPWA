export function computeProximity(post: {
  likes: number;
  seconds: number;
  dislikes: number;
  objections: number;
  rawObjections?: number;
  createdAt: string | Date;
}) {
  const BASE_RADIUS = 800;
  const MAX_CITY_RADIUS = 8000;
  
  const walkingLikes = post.likes || 0;
  const civicVotes = post.seconds || 0;
  const debateHeat = post.dislikes || 0;
  const toxicityFlags = post.objections || 0;
  const rawFlagsCount = typeof post.rawObjections === 'number' ? post.rawObjections : toxicityFlags;
  
  const ripples = Math.floor((walkingLikes + civicVotes + debateHeat) / 5);
  const hoursPassed = Math.max(0, Math.floor((Date.now() - new Date(post.createdAt).getTime()) / (3600 * 1000)));

  const interactionScore = (walkingLikes * 200) + (civicVotes * 300) + (debateHeat * 20);
  const rippleBonus = 1 + (ripples * 0.1);
  const multipliedScore = interactionScore * rippleBonus;

  const toxicityMultiplier = 1 + (toxicityFlags * 0.5);
  const totalDecay = hoursPassed * 50 * toxicityMultiplier;

  let finalRadius = BASE_RADIUS + multipliedScore - totalDecay;
  let shadowbanned = false;
  let hitCityWall = false;

  if (rawFlagsCount >= 10) {
    finalRadius = 0;
    shadowbanned = true;
  } else {
    finalRadius = Math.max(BASE_RADIUS, finalRadius);
    if (finalRadius >= MAX_CITY_RADIUS) {
      finalRadius = MAX_CITY_RADIUS;
      hitCityWall = true;
    }
  }

  return {
    radiusMeters: Math.round(finalRadius),
    shadowbanned,
    hitCityWall
  };
}
