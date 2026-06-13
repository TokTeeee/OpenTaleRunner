import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useCharacterStore } from './stores/characterStore'
import { expToNext } from './services/level/expFormula'
import { useMapStore } from './stores/mapStore'
import { generateWorldMap } from './services/map/worldMapGenerator'

// 调试控制台命令: 在浏览器控制台输入 debugLevelUp() 升一级
;(window as Record<string, unknown>).debugLevelUp = () => {
  const store = useCharacterStore.getState()
  const char = store.character
  if (!char) { console.warn('[debug] 没有角色数据'); return }
  if (char.level >= 20) { console.warn('[debug] 已满级 (Lv.20)'); return }
  const oldLevel = char.level
  const newLevel = oldLevel + 1
  store.applyServerExpGrant({
    level: newLevel,
    exp: 0,
    expToNext: expToNext(newLevel),
    unspentAttributePoints: char.unspentAttributePoints + 1,
    unspentSkillPoints: char.unspentSkillPoints + 1,
  })
  console.log(`[debug] 升级! Lv.${oldLevel} → Lv.${newLevel} (属性点+1, 技能点+1)`)
}

;(window as Record<string, unknown>).debugMapGenerate = () => {
  const store = useMapStore.getState()
  const data = generateWorldMap({ seed: `debug_${Date.now()}` })
  store.generateAndSaveWorldMap(data)
  console.log(`[debug] 世界地图已生成: ${data.regions.length} 个区域`)
}

;(window as Record<string, unknown>).debugMapReset = () => {
  useMapStore.getState().resetMapData()
  console.log('[debug] 地图数据已重置')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
