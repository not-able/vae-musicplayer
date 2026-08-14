import type { AlbumType, CatalogData } from "../../types";

export type XuSongOfficialTrackDefinition = readonly [
  id: string,
  title: string,
  aliases?: readonly string[]
];

export interface XuSongOfficialAlbumDefinition {
  id: string;
  title: string;
  type?: AlbumType;
  tracks: readonly XuSongOfficialTrackDefinition[];
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
        [
          "album_xusong_no1_track_01",
          "爱情里的眼泪",
          ["爱情里的眼泪 (with 安琪)", "爱情里的眼泪 (feat. 安琪)"]
        ],
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
        ["album_xusong_sugelameiyoudi_track_01", "想像之中", ["想象之中"]],
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
        ["album_xusong_buruchichaqu_track_05", "惊鸿一面", ["惊鸿一面 (with 黄龄)"]],
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
    },
    {
      id: "album_xusong_singles_2006_2015",
      title: "早期与独立作品（2006—2015）",
      type: "single_collection",
      tracks: [
        ["track_xusong_meiguihuadezangli", "玫瑰花的葬礼"],
        ["track_xusong_qitiandasheng", "齐天大圣"],
        ["track_xusong_qiuqianzhui", "秋千坠"],
        ["track_xusong_sanchangdianying", "散场电影"],
        ["track_xusong_niruochengfeng", "你若成风"],
        ["track_xusong_qinglvzhuang", "情侣装"],
        ["track_xusong_xuanranbieli", "渲染别离", ["渲染离别"]],
        ["track_xusong_bieyaowo", "别咬我"],
        ["track_xusong_songnidedubai", "送你的独白"],
        ["track_xusong_yaotouwan", "摇头玩"],
        ["track_xusong_suyan", "素颜", ["素颜 (with 何曼婷)"]],
        ["track_xusong_kuayuexinshijie", "跨越新世界"],
        ["track_xusong_tianlongbabu_zhisudi", "天龙八部之宿敌"],
        ["track_xusong_xiaofannaomeishenmedabuliao", "小烦恼没什么大不了"],
        ["track_xusong_weizhangdongwu", "违章动物"],
        ["track_xusong_qiangu", "千古"]
      ]
    },
    {
      id: "album_xusong_singles_2016_2020",
      title: "独立单曲与合作（2016—2020）",
      type: "single_collection",
      tracks: [
        ["track_xusong_shuxiangnianhua", "书香年华", ["书香年华 (with 孙涛)"]],
        ["track_xusong_buyu", "不语", ["不语(电影《不速之客》主题曲)"]],
        ["track_xusong_jianghu", "江湖"],
        ["track_xusong_jinnianyong", "今年勇"],
        ["track_xusong_shenyeshudian", "深夜书店"],
        ["track_xusong_tongguan", "通关", ["通关 (QQ三国十周年主题曲)"]],
        ["track_xusong_hudiedeshijian", "蝴蝶的时间"],
        ["track_xusong_woleyi", "我乐意", ["我乐意(QQ炫舞系列主题曲)"]],
        ["track_xusong_feichiyuni", "飞驰于你", ["飞驰于你(QQ飞车手游敦煌版本主题曲)"]],
        [
          "track_xusong_juedaifenghua",
          "绝代风华",
          ["绝代风华 (游戏《天下3》十周年主题曲)"]
        ],
        [
          "track_xusong_yumu",
          "雨幕",
          ["雨幕 (新天龙八部端游主题曲)", "雨幕（新天龙八部端游主题曲）"]
        ],
        ["track_xusong_xianmu", "羡慕"],
        [
          "track_xusong_quanshijiezuihaodeni",
          "全世界最好的你",
          ["全世界最好的你 (电视剧《全世界最好的你》同名主题曲)"]
        ],
        ["track_xusong_wenquan", "温泉"],
        ["track_xusong_fangsi", "放肆", ["放肆 (《天龙八部》端游怀旧版主题曲)"]],
        ["track_xusong_ruguodangshi2020", "如果当时2020"],
        [
          "track_xusong_banchengyansha_hechang",
          "半城烟沙（合唱版）",
          ["半城烟沙(合唱版)·新天龙八部怀旧服推广曲"]
        ]
      ]
    },
    {
      id: "album_xusong_singles_2021_present",
      title: "独立单曲与合作（2021—至今）",
      type: "single_collection",
      tracks: [
        ["track_xusong_baisemianbaoche_live", "白色面包车", ["白色面包车 (现场)"]],
        ["track_xusong_jiban", "羁绊", ["羁绊 (电视剧《一片冰心在玉壶》主题曲)"]],
        ["track_xusong_liuxiang", "留香"],
        ["track_xusong_tianzhidao", "天知道", ["天知道 (《天谕》手游盟友主题曲)"]],
        [
          "track_xusong_shihuazhongguo",
          "诗画中国",
          ["诗画中国(《诗画中国》节目主题曲)"]
        ],
        ["track_xusong_zhishangxue", "纸上雪", ["纸上雪(诗画中国 第2期)"]],
        [
          "track_xusong_mantuoshanzhuang",
          "曼陀山庄",
          ["曼陀山庄 (《天龙八部》端游怀旧服主题曲)"]
        ],
        ["track_xusong_meixiangdao", "没想到"],
        ["track_xusong_hepai", "合拍"],
        [
          "track_xusong_xinyousuoxiang",
          "心有所向",
          ["心有所向(《经典咏流传·正青春》主题曲)"]
        ],
        ["track_xusong_zhiyouni", "只有你", ["只有你 (影视剧《鱼生知有你》主题曲)"]],
        ["track_xusong_rumi", "如谜", ["如谜(《新天龙八部》手游主题曲)"]],
        ["track_xusong_huapingsheng", "画平生", ["画平生(电影《花千骨》主题曲)"]],
        [
          "track_xusong_zaofabaidicheng",
          "早发白帝城",
          ["早发白帝城(《诗画中国》第2季 第1期)"]
        ],
        [
          "track_xusong_falling_in_love",
          "Falling in Love",
          ["Falling in Love(电视剧《在暴雪时分》片头曲)"]
        ],
        [
          "track_xusong_jiangxinbixin",
          "将芯比心",
          ["将芯比心(《2024中国·AI盛典》主题曲)"]
        ],
        ["track_xusong_yelu", "野路"],
        ["track_xusong_lanxiange", "揽仙歌", ["揽仙歌(《问道》手游9周年主题曲)"]]
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
      type: album.type ?? "album",
      sortOrder: index + 1,
      trackIds: album.tracks.map(([trackId]) => trackId)
    })),
    tracks: albumDefinitions.flatMap((album) =>
      album.tracks.map(([id, title, aliases], index) => ({
        id,
        artistId,
        albumId: album.id,
        title,
        ...(aliases === undefined ? {} : { aliases: [...aliases] }),
        trackNumber: index + 1
      }))
    )
  };
}

export const xuSongOfficialCatalog = createXuSongOfficialCatalog();
