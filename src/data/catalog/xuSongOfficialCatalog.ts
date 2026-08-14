import type { CatalogData } from "../../types";

export interface XuSongOfficialAlbumDefinition {
  id: string;
  title: string;
  tracks: readonly (readonly [id: string, title: string])[];
}

const artistId = "artist_vae";

export const xuSongOfficialAlbumDefinitions: readonly XuSongOfficialAlbumDefinition[] =
  [
    {
      id: "album_xusong_zidingyi",
      title: "自定义",
      tracks: [
        ["album_xusong_zidingyi_track_01", "如果当时"],
        ["album_xusong_zidingyi_track_02", "多余的解释"],
        ["album_xusong_zidingyi_track_03", "有何不可"],
        ["album_xusong_zidingyi_track_04", "坏孩子"],
        ["album_xusong_zidingyi_track_05", "清明雨上"],
        ["album_xusong_zidingyi_track_06", "城府"],
        ["album_xusong_zidingyi_track_07", "认错"],
        ["album_xusong_zidingyi_track_08", "内线"],
        ["album_xusong_zidingyi_track_09", "星座书上"]
      ]
    },
    {
      id: "album_xusong_xunwuqishi",
      title: "寻雾启示",
      tracks: [
        ["album_xusong_xunwuqishi_track_01", "叹服"],
        ["album_xusong_xunwuqishi_track_02", "灰色头像"],
        ["album_xusong_xunwuqishi_track_03", "我无所谓"],
        ["album_xusong_xunwuqishi_track_04", "庐州月"],
        ["album_xusong_xunwuqishi_track_05", "不煽情"],
        ["album_xusong_xunwuqishi_track_06", "我们的恋爱是对生命的严重浪费"],
        ["album_xusong_xunwuqishi_track_07", "白马非马"],
        ["album_xusong_xunwuqishi_track_08", "单人旅途"],
        ["album_xusong_xunwuqishi_track_09", "在那不遥远的地方"]
      ]
    },
    {
      id: "album_xusong_no1",
      title: "许嵩 No.1",
      tracks: [
        ["album_xusong_no1_track_01", "爱情里的眼泪"],
        ["album_xusong_no1_track_02", "安琪"],
        ["album_xusong_no1_track_03", "断桥残雪"],
        ["album_xusong_no1_track_04", "粉色信笺"],
        ["album_xusong_no1_track_05", "看不见的风景"],
        ["album_xusong_no1_track_06", "浅唱"],
        ["album_xusong_no1_track_07", "天使"],
        ["album_xusong_no1_track_08", "我的Baby"],
        ["album_xusong_no1_track_09", "我很喜欢"],
        ["album_xusong_no1_track_10", "我想牵着你的手"],
        ["album_xusong_no1_track_11", "七号公园"]
      ]
    },
    {
      id: "album_xusong_banchengyansha",
      title: "半城烟沙",
      tracks: [
        ["album_xusong_banchengyansha_track_01", "半城烟沙"],
        ["album_xusong_banchengyansha_track_02", "两种悲剧"],
        ["album_xusong_banchengyansha_track_03", "伤声"],
        ["album_xusong_banchengyansha_track_04", "尘世美"],
        ["album_xusong_banchengyansha_track_05", "安徒生不后悔"],
        ["album_xusong_banchengyansha_track_06", "天使"],
        ["album_xusong_banchengyansha_track_07", "我的Baby"],
        ["album_xusong_banchengyansha_track_08", "我很喜欢"],
        ["album_xusong_banchengyansha_track_09", "看不见的风景"],
        ["album_xusong_banchengyansha_track_10", "安琪"],
        ["album_xusong_banchengyansha_track_11", "朝舞"],
        ["album_xusong_banchengyansha_track_12", "花满楼"],
        ["album_xusong_banchengyansha_track_13", "粉色信笺"],
        ["album_xusong_banchengyansha_track_14", "乱乱唱"],
        ["album_xusong_banchengyansha_track_15", "南山忆"],
        ["album_xusong_banchengyansha_track_16", "又小雪"]
      ]
    },
    {
      id: "album_xusong_sugelameiyoudi",
      title: "苏格拉没有底",
      tracks: [
        ["album_xusong_sugelameiyoudi_track_01", "想像之中"],
        ["album_xusong_sugelameiyoudi_track_02", "河山大好"],
        ["album_xusong_sugelameiyoudi_track_03", "拆东墙"],
        ["album_xusong_sugelameiyoudi_track_04", "医生"],
        ["album_xusong_sugelameiyoudi_track_05", "微博控"],
        ["album_xusong_sugelameiyoudi_track_06", "毁人不倦"],
        ["album_xusong_sugelameiyoudi_track_07", "双人旁"],
        ["album_xusong_sugelameiyoudi_track_08", "降温"],
        ["album_xusong_sugelameiyoudi_track_09", "敬酒不吃"],
        ["album_xusong_sugelameiyoudi_track_10", "千百度"]
      ]
    },
    {
      id: "album_xusong_mengyouji",
      title: "梦游计",
      tracks: [
        ["album_xusong_mengyouji_track_01", "胡萝卜须"],
        ["album_xusong_mengyouji_track_02", "幻听"],
        ["album_xusong_mengyouji_track_03", "对话老师"],
        ["album_xusong_mengyouji_track_04", "伴虎"],
        ["album_xusong_mengyouji_track_05", "闺蜜"],
        ["album_xusong_mengyouji_track_06", "装糊涂"],
        ["album_xusong_mengyouji_track_07", "Play With Style"],
        ["album_xusong_mengyouji_track_08", "心疼你的过去"],
        ["album_xusong_mengyouji_track_09", "全球变冷"],
        ["album_xusong_mengyouji_track_10", "亲情式的爱情"]
      ]
    },
    {
      id: "album_xusong_buruchichaqu",
      title: "不如吃茶去",
      tracks: [
        ["album_xusong_buruchichaqu_track_01", "等到烟火清凉"],
        ["album_xusong_buruchichaqu_track_02", "山水之间"],
        ["album_xusong_buruchichaqu_track_03", "七夕"],
        ["album_xusong_buruchichaqu_track_04", "有桃花"],
        ["album_xusong_buruchichaqu_track_05", "惊鸿一面"],
        ["album_xusong_buruchichaqu_track_06", "隐隐约约"],
        ["album_xusong_buruchichaqu_track_07", "宇宙之大"],
        ["album_xusong_buruchichaqu_track_08", "梧桐灯"],
        ["album_xusong_buruchichaqu_track_09", "弹指一挥间"]
      ]
    },
    {
      id: "album_xusong_qingnianwanbao",
      title: "青年晚报",
      tracks: [
        ["album_xusong_qingnianwanbao_track_01", "奇谈"],
        ["album_xusong_qingnianwanbao_track_02", "雅俗共赏"],
        ["album_xusong_qingnianwanbao_track_03", "最佳歌手"],
        ["album_xusong_qingnianwanbao_track_04", "幻胖"],
        ["album_xusong_qingnianwanbao_track_05", "摄影艺术"],
        ["album_xusong_qingnianwanbao_track_06", "平行宇宙"],
        ["album_xusong_qingnianwanbao_track_07", "燕归巢"],
        ["album_xusong_qingnianwanbao_track_08", "摆脱"],
        ["album_xusong_qingnianwanbao_track_09", "早睡身体好"]
      ]
    },
    {
      id: "album_xusong_xunbaoyouxi",
      title: "寻宝游戏",
      tracks: [
        ["album_xusong_xunbaoyouxi_track_01", "老古董"],
        ["album_xusong_xunbaoyouxi_track_02", "大千世界"],
        ["album_xusong_xunbaoyouxi_track_03", "艺术家们"],
        ["album_xusong_xunbaoyouxi_track_04", "九月清晨"],
        ["album_xusong_xunbaoyouxi_track_05", "浪"],
        ["album_xusong_xunbaoyouxi_track_06", "重复重复"],
        ["album_xusong_xunbaoyouxi_track_07", "明智之举"],
        ["album_xusong_xunbaoyouxi_track_08", "如约而至"],
        ["album_xusong_xunbaoyouxi_track_09", "柳成荫"]
      ]
    },
    {
      id: "album_xusong_huxizhiyue",
      title: "呼吸之野",
      tracks: [
        ["album_xusong_huxizhiyue_track_01", "乌鸦"],
        ["album_xusong_huxizhiyue_track_02", "假摔"],
        ["album_xusong_huxizhiyue_track_03", "科幻"],
        ["album_xusong_huxizhiyue_track_04", "万古"],
        ["album_xusong_huxizhiyue_track_05", "冰柜"],
        ["album_xusong_huxizhiyue_track_06", "超市"],
        ["album_xusong_huxizhiyue_track_07", "隔代"],
        ["album_xusong_huxizhiyue_track_08", "野人"],
        ["album_xusong_huxizhiyue_track_09", "三尺"],
        ["album_xusong_huxizhiyue_track_10", "庞贝"]
      ]
    },
    {
      id: "album_xusong_anbocaixiang",
      title: "安泊猜想",
      tracks: [
        ["album_xusong_anbocaixiang_track_01", "粗糙"],
        ["album_xusong_anbocaixiang_track_02", "洛阳纸"],
        ["album_xusong_anbocaixiang_track_03", "前程似锦"],
        ["album_xusong_anbocaixiang_track_04", "老歌"],
        ["album_xusong_anbocaixiang_track_05", "皮下"],
        ["album_xusong_anbocaixiang_track_06", "心安之地"],
        ["album_xusong_anbocaixiang_track_07", "一见如故"],
        ["album_xusong_anbocaixiang_track_08", "出雨林记"],
        ["album_xusong_anbocaixiang_track_09", "忽略不计"]
      ]
    }
  ];

export function createXuSongOfficialCatalog(
  albumDefinitions: readonly XuSongOfficialAlbumDefinition[] = xuSongOfficialAlbumDefinitions
): CatalogData {
  return {
    schemaVersion: 1,
    artists: [
      {
        id: artistId,
        name: "许嵩",
        note: "经核对的正式专辑类目录；不包含音频、歌词、封面或播放链接。"
      }
    ],
    albums: albumDefinitions.map((album, index) => ({
      id: album.id,
      artistId,
      title: album.title,
      type: "album",
      sortOrder: index + 1,
      trackIds: album.tracks.map(([trackId]) => trackId)
    })),
    tracks: albumDefinitions.flatMap((album) =>
      album.tracks.map(([id, title], index) => ({
        id,
        artistId,
        albumId: album.id,
        title,
        trackNumber: index + 1
      }))
    )
  };
}

export const xuSongOfficialCatalog = createXuSongOfficialCatalog();
