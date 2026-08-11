export const SCENES = [
  {
    id: 'choosing',
    still: '/scenes/00-choosing.webp',
    portrait: '/scenes/portrait/00-choosing.webp',
    depth: '/scenes/depth/00-choosing.depth.webp',
    video: '/scenes/video/choosing.mp4',
  },
  {
    id: 'opening',
    still: '/scenes/01-opening.webp',
    portrait: '/scenes/portrait/01-opening.webp',
    depth: '/scenes/depth/01-opening.depth.webp',
    video: '/scenes/video/opening.mp4',
  },
  {
    id: 'draw',
    still: '/scenes/02-draw.webp',
    portrait: '/scenes/portrait/02-draw.webp',
    depth: '/scenes/depth/02-draw.depth.webp',
    sequence: '/scenes/seq/draw-%02d.webp',
    video: '/scenes/video/draw.mp4',
  },
  {
    id: 'flight',
    still: '/scenes/03-flight.webp',
    portrait: '/scenes/portrait/03-flight.webp',
    depth: '/scenes/depth/03-flight.depth.webp',
    video: '/scenes/video/flight.mp4',
  },
  {
    id: 'miss',
    still: '/scenes/04-miss.webp',
    portrait: '/scenes/portrait/04-miss.webp',
    depth: '/scenes/depth/04-miss.depth.webp',
    video: '/scenes/video/miss.mp4',
  },
  {
    id: 'return',
    still: '/scenes/05-return.webp',
    portrait: '/scenes/portrait/05-return.webp',
    depth: '/scenes/depth/05-return.depth.webp',
    video: '/scenes/video/ambient.mp4',
  },
] as const;

export type SceneId = (typeof SCENES)[number]['id'];
