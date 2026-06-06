// Internationalization for locations and game elements
export type LanguageCode = 'zh-CN' | 'en-US';

export interface LocalizationData {
  locations: Record<string, Record<LanguageCode, string>>;
  regions: Record<string, Record<LanguageCode, string>>;
  terrains: Record<string, Record<LanguageCode, string>>;
  weathers: Record<string, Record<LanguageCode, string>>;
}

export const localizationData: LocalizationData = {
  locations: {
    // Aetherlain regions and places
    'Westmarch': { 'zh-CN': '西境', 'en-US': 'Westmarch' },
    'Eastbloom': { 'zh-CN': '东域', 'en-US': 'Eastbloom' },
    'Midlands': { 'zh-CN': '中原', 'en-US': 'Midlands' },
    'Northpeak': { 'zh-CN': '北峰', 'en-US': 'Northpeak' },
    'Southsea': { 'zh-CN': '南海', 'en-US': 'Southsea' },
    'Silverwood': { 'zh-CN': '银林', 'en-US': 'Silverwood' },
    'Ironhold': { 'zh-CN': '铁堡', 'en-US': 'Ironhold' },
    'Duskwater': { 'zh-CN': '暮水', 'en-US': 'Duskwater' },
    'Crystalpeak': { 'zh-CN': '晶峰', 'en-US': 'Crystalpeak' },
    'Shadowmoor': { 'zh-CN': '影沼', 'en-US': 'Shadowmoor' },
    'Starfall': { 'zh-CN': '星陨', 'en-US': 'Starfall' },
    'Goldhaven': { 'zh-CN': '金港', 'en-US': 'Goldhaven' },
    'Thornwick': { 'zh-CN': '荆城', 'en-US': 'Thornwick' },
    'Moonvale': { 'zh-CN': '月谷', 'en-US': 'Moonvale' },
    'Sunhills': { 'zh-CN': '日丘', 'en-US': 'Sunhills' },
    'Mistridge': { 'zh-CN': '雾岭', 'en-US': 'Mistridge' },
    'Stonehold': { 'zh-CN': '石堡', 'en-US': 'Stonehold' },
    'Wildwood': { 'zh-CN': '野林', 'en-US': 'Wildwood' },
    'Ravencrest': { 'zh-CN': '渡鸦顶', 'en-US': 'Ravencrest' },
    'Sunspire': { 'zh-CN': '日塔', 'en-US': 'Sunspire' },
    'Frostholm': { 'zh-CN': '冰岛', 'en-US': 'Frostholm' },
    'Heartwood': { 'zh-CN': '心林', 'en-US': 'Heartwood' },
    'Emberkeep': { 'zh-CN': '烬堡', 'en-US': 'Emberkeep' },
    'Ethereal': { 'zh-CN': '以太之地', 'en-US': 'Ethereal' },
  },

  regions: {
    'Aetherlain': { 'zh-CN': '艾瑟兰', 'en-US': 'Aetherlain' },
    'Northern Kingdom': { 'zh-CN': '北方王国', 'en-US': 'Northern Kingdom' },
    'Southern Realm': { 'zh-CN': '南方领域', 'en-US': 'Southern Realm' },
    'Eastern Territories': { 'zh-CN': '东方领土', 'en-US': 'Eastern Territories' },
    'Western Wilds': { 'zh-CN': '西方荒野', 'en-US': 'Western Wilds' },
    'Central Plains': { 'zh-CN': '中央平原', 'en-US': 'Central Plains' },
    'Enchanted Forests': { 'zh-CN': '魔法森林', 'en-US': 'Enchanted Forests' },
    'Savage Peaks': { 'zh-CN': '蛮荒山峰', 'en-US': 'Savage Peaks' },
    'Coastal Isles': { 'zh-CN': '沿海诸岛', 'en-US': 'Coastal Isles' },
    'Underground Realms': { 'zh-CN': '地下王国', 'en-US': 'Underground Realms' },
    'Desert Expanse': { 'zh-CN': '沙漠荒原', 'en-US': 'Desert Expanse' },
  },

  terrains: {
    'grassland': { 'zh-CN': '草地', 'en-US': 'Grassland' },
    'forest': { 'zh-CN': '森林', 'en-US': 'Forest' },
    'mountain': { 'zh-CN': '山地', 'en-US': 'Mountain' },
    'desert': { 'zh-CN': '沙漠', 'en-US': 'Desert' },
    'water': { 'zh-CN': '水域', 'en-US': 'Water' },
    'swamp': { 'zh-CN': '沼泽', 'en-US': 'Swamp' },
    'cave': { 'zh-CN': '洞穴', 'en-US': 'Cave' },
    'city': { 'zh-CN': '城市', 'en-US': 'City' },
    'village': { 'zh-CN': '村落', 'en-US': 'Village' },
    'ruin': { 'zh-CN': '废墟', 'en-US': 'Ruin' },
    'road': { 'zh-CN': '道路', 'en-US': 'Road' },
    'beach': { 'zh-CN': '海滩', 'en-US': 'Beach' },
  },

  weathers: {
    '晴朗': { 'zh-CN': '晴朗', 'en-US': 'Clear' },
    '多云': { 'zh-CN': '多云', 'en-US': 'Cloudy' },
    '阴天': { 'zh-CN': '阴天', 'en-US': 'Overcast' },
    '下雨': { 'zh-CN': '下雨', 'en-US': 'Rainy' },
    '暴雨': { 'zh-CN': '暴雨', 'en-US': 'Stormy' },
    '下雪': { 'zh-CN': '下雪', 'en-US': 'Snowy' },
    '大雪': { 'zh-CN': '大雪', 'en-US': 'Blizzard' },
    '雾霾': { 'zh-CN': '雾霾', 'en-US': 'Foggy' },
    '酷热': { 'zh-CN': '酷热', 'en-US': 'Scorching' },
    '严寒': { 'zh-CN': '严寒', 'en-US': 'Freezing' },
    '清风': { 'zh-CN': '清风', 'en-US': 'Breezy' },
    '狂风': { 'zh-CN': '狂风', 'en-US': 'Windy' },
  },
};

export function getLocalizedName(
  key: string,
  type: keyof LocalizationData,
  language: LanguageCode
): string {
  const data = localizationData[type];
  if (!data) return key;

  const translation = data[key];
  if (!translation) return key;

  return translation[language] || translation['en-US'] || key;
}

export function getLocalizationFunction(language: LanguageCode) {
  return (key: string, type: keyof LocalizationData) => getLocalizedName(key, type, language);
}
