// Karate videos for students: the syllabus kata, performed by Hirokazu Kanazawa Sensei (Shotokan,
// SKIF), and kumite. Shown on the Karate videos page, with the first group as a row on Home. Each one
// opens on YouTube (the phone's YouTube app or browser), so nothing from YouTube loads inside the app.
// id: the YouTube video id; t: start this many seconds in; jp: the name in Japanese, for the card.
const KANAZAWA = 'Hirokazu Kanazawa Sensei, Shotokan (SKIF)';
export const VIDEO_GROUPS = [
  {
    title: 'Essential Syllabus Kata from Red to Black Belt',
    by: KANAZAWA,
    videos: [
      { name: 'Heian Shodan', jp: '平安初段', id: 'lZyI9mtk924' },
      { name: 'Heian Nidan', jp: '平安二段', id: '_ZPODff5Vew' },
      { name: 'Heian Sandan', jp: '平安三段', id: '28T1JbwbjuE' },
      { name: 'Heian Yondan', jp: '平安四段', id: 'qxw4Guoogu0' },
      { name: 'Heian Godan', jp: '平安五段', id: 'dkCHEv5y51A' },
      { name: 'Tekki Shodan', jp: '鉄騎初段', id: 'Cx0Qwnxq0q4' },
      { name: 'Bassai-Dai', jp: '抜塞大', id: 'EryYYUXvojw' },
      { name: 'Kanku-Dai', jp: '観空大', id: '2rrBRdMmYyA' },
    ],
  },
  {
    title: 'Essential Syllabus Kata for 2nd Dan Black Belt',
    by: KANAZAWA,
    videos: [
      { name: 'Enpi', jp: '燕飛', id: 'vsOt9sMtgeA' },
      { name: 'Bassai-Sho', jp: '抜塞小', id: 'ki17srZIQHI', t: 31 },
      { name: 'Kanku-Sho', jp: '観空小', id: 'WOFf0xWEoUM' },
      { name: 'Jiin', jp: '慈陰', id: 'HzRfPqm6Ycc', t: 35 },
      { name: 'Jion', jp: '慈恩', id: 'cQdAZ94OkNA' },
      { name: 'Jitte', jp: '十手', id: 'XivYh0vSMCQ' },
    ],
  },
  {
    title: 'Kumite',
    videos: [
      { name: 'Gohon Kumite', jp: '五本組手', id: '93LJZc-PcPQ' },
      { name: 'Sanbon Kumite', jp: '三本組手', id: '6GBmwnQDyec' },
      { name: 'Kihon Ippon Kumite', jp: '基本一本組手', id: 'L0wu2Xo87Qg' },
      { name: 'Jiyu Ippon Kumite', jp: '自由一本組手', id: 'izcMJpd8XFQ' },
    ],
  },
];
export const videoUrl = v => `https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}${v.t ? `&t=${v.t}s` : ''}`;
