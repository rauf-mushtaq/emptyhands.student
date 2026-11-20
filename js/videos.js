// Kata videos for students: Hirokazu Kanazawa Sensei (Shotokan, SKIF) performing the syllabus kata.
// Shown on Home and on the Kata videos page. Each one opens on YouTube (the phone's YouTube app or
// browser), so nothing from YouTube loads inside the app. id: the YouTube video id; t: start this
// many seconds in; jp: the kata's name in Japanese, for the card.
export const KATA_GROUPS = [
  {
    title: 'Essential Syllabus Kata from Red to Black Belt',
    kata: [
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
    kata: [
      { name: 'Enpi', jp: '燕飛', id: 'vsOt9sMtgeA' },
      { name: 'Bassai-Sho', jp: '抜塞小', id: 'ki17srZIQHI', t: 31 },
      { name: 'Kanku-Sho', jp: '観空小', id: 'WOFf0xWEoUM' },
      { name: 'Jiin', jp: '慈陰', id: 'HzRfPqm6Ycc', t: 35 },
      { name: 'Jion', jp: '慈恩', id: 'cQdAZ94OkNA' },
      { name: 'Jitte', jp: '十手', id: 'XivYh0vSMCQ' },
    ],
  },
];
export const KATA_BY = 'Shotokan (SKIF) · Hirokazu Kanazawa';
export const kataUrl = k => `https://www.youtube.com/watch?v=${encodeURIComponent(k.id)}${k.t ? `&t=${k.t}s` : ''}`;
