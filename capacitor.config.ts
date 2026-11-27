import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.seony.assistant',
  appName: 'Leaf',
  webDir: 'dist',
  plugins: {
    // 화면이 상태바 아래까지 그려진다는 것을 처음부터 알려 열 때 글자가 위로 붙었다 내려오지 않게 한다.
    SystemBars: { initialViewportFitValueHint: 'cover' },
  },
}

export default config