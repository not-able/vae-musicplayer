import type { CatalogData } from "../../types";

interface XuSongOfficialAlbumDefinition {
  id: string;
  title: string;
  tracks: readonly string[];
}

const artistId = "artist_vae";

const albums: readonly XuSongOfficialAlbumDefinition[] = [
  {
    id: "album_xusong_zidingyi",
    title: "自定义",
    tracks: [
      "如果当时",
      "多余的解释",
      "有何不可",
      "坏孩子",
      "清明雨上",
      "城府",
      "认错",
      "内线",
      "星座书上"
    ]
  },
  {
    id: "album_xusong_xunwuqishi",
    title: "寻雾启示",
    tracks: [
      "叹服",
      "灰色头像",
      "我无所谓",
      "庐州月",
      "不煽情",
      "我们的恋爱是对生命的严重浪费",
      "白马非马",
      "单人旅途",
      "在那不遥远的地方"
    ]
  },
  {
    id: "album_xusong_no1",
    title: "许嵩 No.1",
    tracks: [
      "爱情里的眼泪",
      "安琪",
      "断桥残雪",
      "粉色信笺",
      "看不见的风景",
      "浅唱",
      "天使",
      "我的Baby",
      "我很喜欢",
      "我想牵着你的手",
      "七号公园"
    ]
  },
  {
    id: "album_xusong_banchengyansha",
    title: "半城烟沙",
    tracks: [
      "半城烟沙",
      "两种悲剧",
      "伤声",
      "尘世美",
      "安徒生不后悔",
      "天使",
      "我的Baby",
      "我很喜欢",
      "看不见的风景",
      "安琪",
      "朝舞",
      "花满楼",
      "粉色信笺",
      "乱乱唱",
      "南山忆",
      "又小雪"
    ]
  },
  {
    id: "album_xusong_sugelameiyoudi",
    title: "苏格拉没有底",
    tracks: [
      "想像之中",
      "河山大好",
      "拆东墙",
      "医生",
      "微博控",
      "毁人不倦",
      "双人旁",
      "降温",
      "敬酒不吃",
      "千百度"
    ]
  },
  {
    id: "album_xusong_mengyouji",
    title: "梦游计",
    tracks: [
      "胡萝卜须",
      "幻听",
      "对话老师",
      "伴虎",
      "闺蜜",
      "装糊涂",
      "Play With Style",
      "心疼你的过去",
      "全球变冷",
      "亲情式的爱情"
    ]
  },
  {
    id: "album_xusong_buruchichaqu",
    title: "不如吃茶去",
    tracks: [
      "等到烟火清凉",
      "山水之间",
      "七夕",
      "有桃花",
      "惊鸿一面",
      "隐隐约约",
      "宇宙之大",
      "梧桐灯",
      "弹指一挥间"
    ]
  },
  {
    id: "album_xusong_qingnianwanbao",
    title: "青年晚报",
    tracks: [
      "奇谈",
      "雅俗共赏",
      "最佳歌手",
      "幻胖",
      "摄影艺术",
      "平行宇宙",
      "燕归巢",
      "摆脱",
      "早睡身体好"
    ]
  },
  {
    id: "album_xusong_xunbaoyouxi",
    title: "寻宝游戏",
    tracks: [
      "老古董",
      "大千世界",
      "艺术家们",
      "九月清晨",
      "浪",
      "重复重复",
      "明智之举",
      "如约而至",
      "柳成荫"
    ]
  },
  {
    id: "album_xusong_huxizhiyue",
    title: "呼吸之野",
    tracks: [
      "乌鸦",
      "假摔",
      "科幻",
      "万古",
      "冰柜",
      "超市",
      "隔代",
      "野人",
      "三尺",
      "庞贝"
    ]
  },
  {
    id: "album_xusong_anbocaixiang",
    title: "安泊猜想",
    tracks: [
      "粗糙",
      "洛阳纸",
      "前程似锦",
      "老歌",
      "皮下",
      "心安之地",
      "一见如故",
      "出雨林记",
      "忽略不计"
    ]
  }
];

export const xuSongOfficialCatalog: CatalogData = {
  schemaVersion: 1,
  artists: [
    {
      id: artistId,
      name: "许嵩",
      note: "经核对的正式专辑类目录；不包含音频、歌词、封面或播放链接。"
    }
  ],
  albums: albums.map((album, index) => ({
    id: album.id,
    artistId,
    title: album.title,
    type: "album",
    sortOrder: index + 1,
    trackIds: album.tracks.map((_, trackIndex) =>
      createTrackId(album.id, trackIndex + 1)
    )
  })),
  tracks: albums.flatMap((album) =>
    album.tracks.map((title, index) => ({
      id: createTrackId(album.id, index + 1),
      artistId,
      albumId: album.id,
      title,
      trackNumber: index + 1
    }))
  )
};

function createTrackId(albumId: string, trackNumber: number): string {
  return `${albumId}_track_${String(trackNumber).padStart(2, "0")}`;
}
