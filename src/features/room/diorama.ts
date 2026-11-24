import * as THREE from 'three'
import type { Scene } from '../assistant/speech'
import type { Sky } from '../online/weather'
import { createBurst, heartGeometry } from './burst'

export type RoomTarget = 'assistant' | 'diary' | 'event' | 'note' | 'todo' | 'weather'

export interface Diorama {
  setScene(scene: Scene): void
  setSky(sky: Sky): void
  hop(): void
  celebrate(): void
  dispose(): void
}

type Point = [number, number, number]

const LIGHT: Record<Scene, { color: string; sun: number; sky: number; exposure: number }> = {
  morning: { color: '#fff1df', sun: 1.75, sky: 0.5, exposure: 0.96 },
  rain: { color: '#d5e2ee', sun: 1.1, sky: 0.6, exposure: 0.96 },
  busy: { color: '#ffd09a', sun: 2, sky: 0.45, exposure: 0.96 },
  night: { color: '#98a6ff', sun: 0.95, sky: 0.5, exposure: 0.8 },
}

const RAIN_COUNT = 130
const SECONDS = { assistant: 0.6, books: 0.9, calendar: 1.1, plant: 0.8, checklist: 1.4, sky: 0.8 }
const CONFETTI = ['#e98a6c', '#f2b36f', '#8fb3bd', '#bfdc8c', '#f0a39a']

type Effect = keyof typeof SECONDS

function material(color: string, roughness = 0.6, options: THREE.MeshPhysicalMaterialParameters = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, envMapIntensity: 0.42, ...options })
}

function mesh(
  geometry: THREE.BufferGeometry,
  surface: THREE.Material,
  [x, y, z]: Point,
  parent: THREE.Object3D,
) {
  const object = new THREE.Mesh(geometry, surface)
  object.position.set(x, y, z)
  object.castShadow = true
  object.receiveShadow = true
  parent.add(object)
  return object
}

function lathe(points: [number, number][]) {
  const curve = new THREE.SplineCurve(points.map(([x, y]) => new THREE.Vector2(x, y)))
  return new THREE.LatheGeometry(curve.getPoints(48), 72)
}

function sphere(radius: number) {
  return new THREE.SphereGeometry(radius, 40, 30)
}

function roundedBox(width: number, height: number, depth: number, radius: number) {
  const shape = new THREE.Shape()
  const x = width / 2 - radius
  const y = height / 2 - radius
  shape.absarc(x, y, radius, 0, Math.PI / 2)
  shape.absarc(-x, y, radius, Math.PI / 2, Math.PI)
  shape.absarc(-x, -y, radius, Math.PI, Math.PI * 1.5)
  shape.absarc(x, -y, radius, Math.PI * 1.5, Math.PI * 2)
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth - 0.06,
    bevelEnabled: true,
    bevelSize: 0.03,
    bevelThickness: 0.03,
    bevelSegments: 5,
    curveSegments: 10,
  })
  return geometry.translate(0, 0, -depth / 2 + 0.03)
}

function group(position: Point, parent: THREE.Object3D) {
  const object = new THREE.Group()
  object.position.set(...position)
  parent.add(object)
  return object
}

function studioEnvironment(renderer: THREE.WebGLRenderer) {
  const studio = new THREE.Scene()
  const geometry = new THREE.SphereGeometry(10, 32, 16)
  const shader = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader:
      'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 p;void main(){
      float h=normalize(p).y*.5+.5;
      vec3 c=mix(vec3(.5,.45,.4),vec3(.95,1.,1.05),h);
      c+=2.*smoothstep(.93,.98,dot(normalize(p),normalize(vec3(-.5,.8,.6))));
      gl_FragColor=vec4(c,1.);}`,
  })
  studio.add(new THREE.Mesh(geometry, shader))
  const generator = new THREE.PMREMGenerator(renderer)
  const target = generator.fromScene(studio)
  generator.dispose()
  geometry.dispose()
  shader.dispose()
  return target
}

function buildIsland(parent: THREE.Object3D) {
  mesh(lathe([[0, -0.9], [0.9, -0.82], [1.75, -0.5], [2.2, -0.12], [2.22, 0], [2.1, 0.05]]), material('#b9a3a0', 0.9), [0, 0, 0], parent)
  mesh(lathe([[2.14, -0.1], [2.28, -0.02], [2.22, 0.1], [1.9, 0.14], [0, 0.14]]), material('#eadfd6', 0.95), [0, 0, 0], parent)
  mesh(lathe([[1.22, 0.12], [1.24, 0.17], [1.16, 0.2], [0, 0.2]]), material('#fbf6f2', 0.95), [0, 0, 0], parent)
  for (const [color, radius] of [['#e9a08c', 1], ['#8fb3bd', 0.72]] as const) {
    mesh(new THREE.TorusGeometry(radius, 0.025, 12, 90), material(color, 0.9), [0, 0.2, 0], parent).rotation.x = Math.PI / 2
  }
  const flowers = [[-1.9, 0.1], [1.95, 0.1], [0.4, -1.75], [-0.45, 1.7], [-1.2, -1.45]]
  flowers.forEach(([x, z], index) => {
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), material('#b5a89c'), [x, 0.2, z], parent)
    mesh(sphere(0.05), material(index % 2 ? '#fff3df' : '#f1b3a4', 0.8), [x, 0.3, z], parent)
  })
}

function buildAssistant(parent: THREE.Object3D) {
  const root = group([0, 0.2, 0.1], parent)
  const body = group([0, 0, 0], root)
  const skin = material('#bfdc8c', 0.42, {
    clearcoat: 0.35,
    clearcoatRoughness: 0.5,
    sheen: 1,
    sheenColor: new THREE.Color('#f4ffd0'),
  })
  mesh(lathe([[0, 0], [0.5, 0.02], [0.78, 0.18], [0.86, 0.5], [0.76, 0.9], [0.55, 1.22], [0.3, 1.42], [0, 1.5]]), skin, [0, 0, 0], body)
  mesh(sphere(0.5), material('#eaf5c9'), [0, 0.46, 0.44], body).scale.set(1, 0.82, 0.84)

  const dark = material('#1c2a2e', 0.12, { clearcoat: 1 })
  const shine = new THREE.MeshBasicMaterial({ color: '#fff' })
  const eyes = group([0, 0, 0], body)
  const closedEyes = group([0, 0, 0], body)
  const arms = [-1, 1].map((side) => {
    const arm = mesh(sphere(0.17), skin, [side * 0.8, 0.56, 0.22], body)
    arm.scale.set(0.8, 1.35, 0.85)

    mesh(sphere(0.2), material('#a6c877', 0.55), [side * 0.34, 0.07, 0.5], body).scale.set(1.1, 0.55, 1.25)

    const eye = group([side * 0.29, 0.97, 0.66], eyes)
    eye.rotation.y = side * 0.34
    mesh(sphere(0.098), dark, [0, 0, 0], eye).scale.set(1, 1.22, 0.6)
    mesh(sphere(0.03), shine, [-0.03, 0.05, 0.055], eye)
    mesh(sphere(0.015), shine, [0.035, -0.04, 0.058], eye)

    const lid = mesh(new THREE.TorusGeometry(0.1, 0.02, 10, 24, Math.PI), dark, [side * 0.29, 1, 0.69], closedEyes)
    lid.rotation.set(0, side * 0.34, Math.PI)

    const cheek = mesh(sphere(0.11), material('#f0a39a', 0.9), [side * 0.5, 0.79, 0.62], body)
    cheek.scale.set(1, 0.62, 0.3)
    cheek.rotation.y = side * 0.65
    cheek.castShadow = false
    return arm
  })
  mesh(new THREE.TorusGeometry(0.065, 0.017, 10, 24, Math.PI), dark, [0, 0.86, 0.785], body).rotation.z = Math.PI

  const sprout = group([0, 1.46, 0], body)
  const stem = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(),
    new THREE.Vector3(-0.03, 0.16, 0),
    new THREE.Vector3(0.02, 0.34, 0),
  )
  mesh(new THREE.TubeGeometry(stem, 20, 0.035, 12), material('#6b9a52'), [0, 0, 0], sprout)
  for (const side of [-1, 1]) {
    const geometry = sphere(1)
    const position = geometry.attributes.position
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index)
      position.setXYZ(
        index,
        (x + 1) * 0.31,
        position.getY(index) * 0.04 + 0.12 * Math.sin((x + 1) * 1.5),
        position.getZ(index) * 0.19 * (1 - 0.35 * x),
      )
    }
    geometry.computeVertexNormals()
    const leaf = mesh(geometry, material(side < 0 ? '#6fae58' : '#86c268', 0.5, { clearcoat: 0.3 }), [0.02, 0.31, 0], sprout)
    leaf.rotation.y = side < 0 ? Math.PI - 0.25 : -0.25
    leaf.rotation.z = 0.2
  }

  const umbrella = group([0.06, 0.9, 0], body)
  umbrella.rotation.z = -0.1
  const canopy = new THREE.SphereGeometry(1.35, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.33)
  mesh(canopy, material('#e98a6c', 0.6, { side: THREE.DoubleSide }), [0, 0.05, 0], umbrella)
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 12), material('#f6e9dc'), [0.82, 0.35, 0.22], umbrella)

  return { root, body, arms, eyes, closedEyes, sprout, umbrella }
}

function buildProps(parent: THREE.Object3D) {
  const books = group([-1.35, 0.14, 0.75], parent)
  const covers = [['#6f86b8', 0.82, 0.1], ['#e2ab6b', 0.74, -0.16], ['#c9756a', 0.66, 0.12]] as const
  const bookStack = covers.map(([color, width, turn], index) => {
    const book = group([0, 0.09 + index * 0.17, 0], books)
    book.rotation.y = turn
    mesh(roundedBox(width, 0.55, 0.15, 0.04), material(color, 0.7), [0, 0, 0], book).rotation.x = Math.PI / 2
    mesh(roundedBox(width - 0.05, 0.1, 0.5, 0.02), material('#fbf3e4', 0.9), [0.06, 0, 0.01], book)
    return book
  })

  const calendar = group([1.35, 0.62, -0.55], parent)
  calendar.rotation.y = -0.45
  mesh(roundedBox(0.95, 0.85, 0.1, 0.1), material('#fbf6ee', 0.8), [0, 0, 0], calendar)
  mesh(roundedBox(0.95, 0.22, 0.13, 0.07), material('#e08a72', 0.7), [0, 0.33, 0.01], calendar)
  const dots = Array.from({ length: 12 }, (_, index) => {
    const dot: Point = [-0.3 + (index % 4) * 0.2, 0.1 - Math.floor(index / 4) * 0.19, 0.06]
    return mesh(sphere(0.045), material(index === 6 ? '#e08a72' : '#b9cdd0', 0.7), dot, calendar)
  })
  for (const x of [-0.28, 0.28]) {
    mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 12), material('#a97958'), [x, -0.3, -0.12], calendar).rotation.x = 0.3
  }

  const lamp = group([-1.3, 0.14, -0.7], parent)
  const shade = material('#f2b36f', 0.5, { emissive: new THREE.Color('#ff9d3c'), emissiveIntensity: 0 })
  mesh(lathe([[0, 0], [0.2, 0.02], [0.17, 0.3], [0.13, 0.75], [0, 0.8]]), material('#f7ead9', 0.8), [0, 0, 0], lamp)
  mesh(lathe([[0, 0.66], [0.4, 0.64], [0.58, 0.74], [0.5, 1.02], [0.27, 1.2], [0, 1.26]]), shade, [0, 0, 0], lamp)
  for (const spot of [[0.2, 1.02, 0.38], [-0.22, 1.08, 0.28], [0, 0.86, 0.53]] as Point[]) {
    mesh(sphere(0.07), material('#fff4e2', 0.7), spot, lamp).scale.set(1, 1, 0.5)
  }
  const glow = new THREE.PointLight('#ffb265', 0, 6, 1.5)
  glow.position.set(-1.2, 1.1, 0.2)
  parent.add(glow)

  const plant = group([1.4, 0.14, 0.75], parent)
  mesh(lathe([[0, 0], [0.2, 0.01], [0.27, 0.32], [0.3, 0.36], [0.24, 0.38], [0, 0.36]]), material('#d98f72', 0.85), [0, 0, 0], plant)
  for (const [x, y, z, radius] of [[0, 0.52, 0, 0.2], [0.15, 0.46, 0.05, 0.14], [-0.14, 0.47, 0.04, 0.15]]) {
    mesh(new THREE.IcosahedronGeometry(radius, 3), material('#9db0a6', 0.9), [x, y, z], plant)
  }

  const flower = group([0.02, 0.74, 0.1], plant)
  flower.rotation.x = -0.3
  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2
    const petal = mesh(sphere(0.085), material('#f3a7a0', 0.7), [Math.cos(angle) * 0.1, Math.sin(angle) * 0.1, 0], flower)
    petal.scale.z = 0.45
  }
  mesh(sphere(0.065), material('#f6cf74', 0.7), [0, 0, 0.03], flower)

  const checklist = group([0.74, 0.5, 1.42], parent)
  checklist.rotation.set(-0.28, 0.12, 0)
  mesh(roundedBox(0.56, 0.7, 0.08, 0.06), material('#c98f6b', 0.75), [0, 0, 0], checklist)
  mesh(roundedBox(0.44, 0.54, 0.07, 0.03), material('#fffaf2', 0.9), [0, -0.03, 0.02], checklist)
  mesh(roundedBox(0.2, 0.1, 0.1, 0.03), material('#8fb3bd', 0.5), [0, 0.33, 0.03], checklist)
  const checks = [0.13, -0.03, -0.19].map((y) => {
    mesh(sphere(0.05), material('#e3ddd6', 0.9), [-0.14, y, 0.06], checklist).scale.z = 0.3
    mesh(roundedBox(0.22, 0.04, 0.065, 0.015), material('#d8d1ca', 0.9), [0.06, y, 0.04], checklist)
    return mesh(sphere(0.058), material('#7fb069', 0.6), [-0.14, y, 0.07], checklist)
  })

  const sky = group([-1.5, 2.35, -1], parent)
  const skies = {
    cloud: group([0, 0, 0], sky),
    sun: group([0, 0, 0], sky),
    moon: group([0, 0, 0], sky),
    snow: group([0, 0, 0], sky),
    rain: group([0, 0, 0], sky),
  }

  const cloudSurface = material('#ffffff', 1)
  for (const [x, y, radius] of [[0, 0, 0.3], [0.33, -0.05, 0.23], [-0.32, -0.06, 0.22], [0.1, 0.17, 0.22]]) {
    mesh(sphere(radius), cloudSurface, [x, y, 0], skies.cloud)
  }

  const sunSurface = material('#f7bd4f', 0.55)
  mesh(sphere(0.3), sunSurface, [0, 0, 0], skies.sun)
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2
    const ray = mesh(new THREE.CapsuleGeometry(0.05, 0.12, 6, 14), sunSurface, [Math.cos(angle) * 0.46, Math.sin(angle) * 0.46, 0], skies.sun)
    ray.rotation.z = angle - Math.PI / 2
  }

  const moonShape = new THREE.Shape()
  moonShape.absarc(0, 0, 0.34, Math.PI * 0.35, Math.PI * 1.65, false)
  moonShape.absarc(0.2, 0, 0.306, Math.PI * 1.45, Math.PI * 0.55, true)
  const moon = new THREE.ExtrudeGeometry(moonShape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.05, bevelSegments: 6, curveSegments: 32 })
  mesh(moon, material('#f6e3a1', 0.6, { emissive: new THREE.Color('#e8c766'), emissiveIntensity: 0.45 }), [0, 0, 0], skies.moon).rotation.z = 0.4

  const snowSurface = material('#a9cdec', 0.5)
  for (let index = 0; index < 6; index += 1) {
    const arm = group([0, 0, 0], skies.snow)
    arm.rotation.z = (index / 6) * Math.PI * 2
    mesh(new THREE.CapsuleGeometry(0.045, 0.36, 6, 14), snowSurface, [0, 0.22, 0], arm)
    for (const side of [-1, 1]) {
      const twig = mesh(new THREE.CapsuleGeometry(0.038, 0.1, 6, 12), snowSurface, [side * 0.075, 0.32, 0], arm)
      twig.rotation.z = -side * 0.85
    }
  }

  const umbrella = new THREE.SphereGeometry(0.46, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.42)
  mesh(umbrella, material('#7fa6c9', 0.6, { side: THREE.DoubleSide }), [0, 0, 0], skies.rain)
  mesh(sphere(0.045), material('#f6e9dc'), [0, 0.48, 0], skies.rain)
  mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 12), material('#f6e9dc'), [0, 0.08, 0], skies.rain)
  mesh(new THREE.TorusGeometry(0.08, 0.025, 10, 24, Math.PI), material('#f6e9dc'), [0.08, -0.28, 0], skies.rain).rotation.z = Math.PI

  return { books, bookStack, calendar, dots, lamp, shade, glow, plant, flower, checklist, checks, sky, skies }
}

export function createDiorama(
  container: HTMLElement,
  onTap: (target: RoomTarget) => void,
): Diorama {
  const canvas = document.createElement('canvas')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  container.append(canvas)
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping

  const world = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(27, 1, 0.1, 100)
  const environment = studioEnvironment(renderer)
  world.environment = environment.texture

  const island = group([0, 0, 0], world)
  buildIsland(island)
  const assistant = buildAssistant(island)
  const props = buildProps(island)

  const drops = Array.from({ length: RAIN_COUNT }, () => [
    Math.random() * 5 - 2.5,
    Math.random() * 5,
    Math.random() * 4 - 2,
  ])
  const rainPositions = new THREE.BufferAttribute(new Float32Array(RAIN_COUNT * 6), 3)
  const rain = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', rainPositions),
    new THREE.LineBasicMaterial({ color: '#eef6fb', transparent: true, opacity: 0.65 }),
  )
  rain.frustumCulled = false
  island.add(rain)

  const starPositions = Array.from({ length: 90 }, () => [
    Math.random() * 14 - 7,
    Math.random() * 7 - 1.5,
    -4 - Math.random() * 2,
  ]).flat()
  const stars = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3)),
    new THREE.PointsMaterial({ color: '#fff6d8', size: 0.045 }),
  )
  world.add(stars)

  const skyLight = new THREE.HemisphereLight('#fff', '#b9a894', 1)
  const sun = new THREE.DirectionalLight('#fff', 2)
  sun.position.set(-3, 6, 4)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.radius = 5
  sun.shadow.normalBias = 0.03
  Object.assign(sun.shadow.camera, { left: -3.5, right: 3.5, top: 4, bottom: -3 })
  const rim = new THREE.DirectionalLight('#ffe0c8', 1.1)
  rim.position.set(3, 3, -4)
  world.add(skyLight, sun, rim)

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const pointer = { x: 0, y: 0 }
  let scene: Scene = 'morning'
  let sky: Sky = 'cloud'
  let lampOn = false
  let blooming = false
  let flowerScale = 0
  let renderedAt = performance.now()
  const startedAt: Partial<Record<Effect, number>> = {}

  const hearts = createBurst(heartGeometry(0.07), 24, island)
  const confetti = createBurst(new THREE.PlaneGeometry(0.1, 0.07), 80, island)
  const papers = createBurst(new THREE.PlaneGeometry(0.2, 0.26), 12, island)

  /** 진행 중이면 0~1, 아니면 null. */
  function progress(effect: Effect) {
    const started = startedAt[effect]
    if (started === undefined) return null
    const value = (performance.now() - started) / 1000 / SECONDS[effect]
    return value < 1 ? value : null
  }

  function play(effect: Effect) {
    if (effect === 'plant') blooming = !blooming
    if (still) {
      flowerScale = blooming ? 1 : 0
      render()
      return
    }
    startedAt[effect] = performance.now()
    if (effect === 'assistant') {
      hearts.emit({ origin: new THREE.Vector3(0, 1.5, 0.5), colors: ['#ee8f88', '#f6b4a8'], count: 5, rise: 1.1, spread: 0.5, gravity: 0.5, seconds: 1.4 })
    } else if (effect === 'books') {
      papers.emit({ origin: new THREE.Vector3(-1.35, 0.8, 0.8), colors: ['#fffaf0', '#fbf0dd'], count: 4, rise: 1.5, spread: 0.5, gravity: 1.2, seconds: 1.8 })
    } else if (effect === 'plant' && blooming) {
      confetti.emit({ origin: new THREE.Vector3(1.42, 1, 0.9), colors: ['#f3a7a0', '#f6cf74'], count: 10, rise: 1, spread: 0.5, gravity: 1.6, seconds: 1.1 })
    }
  }

  function celebrate() {
    if (still) return
    for (const x of [-0.9, 0.9]) {
      confetti.emit({ origin: new THREE.Vector3(x, 0.8, 0.9), colors: CONFETTI, count: 32, rise: 3.2, spread: 1.1, gravity: 3, seconds: 2 })
    }
  }

  function animateEffects(elapsed: number) {
    const books = progress('books')
    props.bookStack.forEach((book, index) => {
      const lift = books === null ? 0 : Math.max(0, Math.sin(books * Math.PI * 1.4 - (2 - index) * 0.5))
      book.position.y = 0.09 + index * 0.17 + lift * 0.1 * (index + 1)
    })
    const calendar = progress('calendar')
    props.calendar.rotation.z = calendar === null ? 0 : Math.sin(calendar * Math.PI * 5) * 0.09 * (1 - calendar)
    props.dots.forEach((dot, index) => {
      const wave = calendar === null ? 0 : Math.max(0, Math.sin(calendar * Math.PI * 3 - index * 0.35))
      dot.scale.set(1 + wave * 0.6, 1 + wave * 0.6, 0.4 + wave)
    })
    const checklist = progress('checklist')
    props.checklist.rotation.z = checklist === null ? 0 : Math.sin(checklist * Math.PI * 4) * 0.06 * (1 - checklist)
    props.checks.forEach((check, index) => {
      // 쉴 때는 첫 줄만 찍혀 있다.
      const resting = index === 0 ? 1 : 0.001
      const pop = checklist === null ? 0 : Math.min(1, Math.max(0, checklist * 5 - index))
      const scale = checklist === null ? resting : Math.max(pop + Math.sin(pop * Math.PI) * 0.5, 0.001)
      check.scale.set(scale, scale, scale * 0.45)
    })
    const plant = progress('plant')
    props.plant.rotation.z = plant === null ? 0 : Math.sin(plant * Math.PI * 5) * 0.12 * (1 - plant)
    flowerScale += ((blooming ? 1 : 0) - flowerScale) * Math.min(1, elapsed * 9)
    props.flower.scale.setScalar(Math.max(flowerScale, 0.001))

    const pop = progress('sky')
    props.sky.scale.setScalar(pop === null ? 1 : 1 + Math.sin(pop * Math.PI * 3) * 0.22 * (1 - pop))
    for (const burst of [hearts, confetti, papers]) burst.update(elapsed)
  }

  function render() {
    const time = still ? 1 : performance.now() / 1000
    const breath = Math.sin(time * 2) * 0.015
    const hop = progress('assistant') ?? 0
    const hopping = hop > 0
    const elapsed = Math.min((performance.now() - renderedAt) / 1000, 0.05)
    renderedAt = performance.now()
    animateEffects(elapsed)

    island.position.y = Math.sin(time * 0.8) * 0.04 - 0.12
    island.rotation.y += (pointer.x * 0.22 - 0.12 - island.rotation.y) * 0.05

    const { root, body, arms, eyes, sprout } = assistant
    root.position.y = 0.2 + (hopping ? Math.sin(hop * Math.PI) * 0.45 : 0)
    body.scale.set(1 - breath, 1 + breath, 1 - breath)
    if (hopping) body.scale.y *= 1 + 0.1 * Math.sin(hop * Math.PI * 2)
    body.rotation.z = scene === 'night' ? 0.05 : Math.sin(time) * 0.012
    body.rotation.y = pointer.x * 0.15
    arms.forEach((arm, index) => {
      arm.rotation.z = (index ? 1 : -1) * (0.5 + (hopping ? 1 : 0) + Math.sin(time * 2) * 0.05)
    })
    eyes.position.set(pointer.x * 0.025, -pointer.y * 0.02, 0)
    for (const eye of eyes.children) eye.scale.y = !still && time % 4 < 0.12 ? 0.12 : 1
    const droop = { morning: 0, rain: 0, busy: -0.35, night: 0.3 }[scene]
    sprout.rotation.z = Math.sin(time * 1.6) * 0.06 + droop
    props.sky.position.x = -1.5 + Math.sin(time * 0.25) * 0.35
    props.skies.sun.rotation.z = time * 0.2
    props.skies.snow.rotation.z = Math.sin(time * 0.6) * 0.4
    props.skies.rain.rotation.z = -0.25 + Math.sin(time * 0.9) * 0.08

    if (rain.visible) {
      drops.forEach(([x, offset, z], index) => {
        const y = 5 - ((offset + time * 4) % 5)
        rainPositions.setXYZ(index * 2, x, y, z)
        rainPositions.setXYZ(index * 2 + 1, x + 0.02, y + 0.16, z)
      })
      rainPositions.needsUpdate = true
    }
    renderer.render(world, camera)
  }

  function switchLamp(on: boolean) {
    lampOn = on
    props.shade.emissiveIntensity = on ? 0.9 : 0
    props.glow.intensity = on ? 9 : 0
  }

  function showSky() {
    // 밤에는 해 대신 달을 띄운다.
    const shown = sky === 'sun' && scene === 'night' ? 'moon' : sky
    for (const [name, object] of Object.entries(props.skies)) object.visible = name === shown
  }

  function setSky(next: Sky) {
    if (next !== sky && !still) startedAt.sky = performance.now()
    sky = next
    showSky()
    render()
  }

  function setScene(next: Scene) {
    scene = next
    const light = LIGHT[next]
    sun.color.set(light.color)
    sun.intensity = light.sun
    skyLight.intensity = light.sky
    renderer.toneMappingExposure = light.exposure
    world.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshPhysicalMaterial) {
        object.material.envMapIntensity = next === 'night' ? 0.16 : 0.42
      }
    })
    switchLamp(next === 'night')
    rain.visible = assistant.umbrella.visible = next === 'rain'
    assistant.sprout.visible = next !== 'rain'
    stars.visible = assistant.closedEyes.visible = next === 'night'
    assistant.eyes.visible = next !== 'night'
    showSky()
    render()
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = container
    if (!width || !height) return
    renderer.setSize(width, height, false)
    const narrow = width < 600
    camera.aspect = width / height
    const distance = narrow
      ? Math.max(10.2, 9.6 / camera.aspect)
      : Math.max(10.8, 11.2 / Math.min(camera.aspect, 1))
    camera.position.set(0, distance * 0.3, distance)
    camera.lookAt(0, narrow ? 0.95 : 1.1, 0)
    camera.updateProjectionMatrix()
    render()
  }

  function followPointer(event: PointerEvent) {
    pointer.x = (event.clientX / innerWidth) * 2 - 1
    pointer.y = (event.clientY / innerHeight) * 2 - 1
  }

  const targets: { object: THREE.Object3D; effect: Effect | 'lamp'; target?: RoomTarget }[] = [
    { object: assistant.root, effect: 'assistant', target: 'assistant' },
    { object: props.books, effect: 'books', target: 'diary' },
    { object: props.calendar, effect: 'calendar', target: 'event' },
    { object: props.plant, effect: 'plant', target: 'note' },
    { object: props.checklist, effect: 'checklist', target: 'todo' },
    { object: props.sky, effect: 'sky', target: 'weather' },
    { object: props.lamp, effect: 'lamp' },
  ]
  const raycaster = new THREE.Raycaster()

  function tap(event: MouseEvent) {
    const bounds = canvas.getBoundingClientRect()
    const point = new THREE.Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      1 - ((event.clientY - bounds.top) / bounds.height) * 2,
    )
    raycaster.setFromCamera(point, camera)
    const hits = targets.flatMap((item) => {
      const [hit] = item.object.visible ? raycaster.intersectObject(item.object, true) : []
      return hit ? [{ distance: hit.distance, item }] : []
    })
    const nearest = hits.sort((left, right) => left.distance - right.distance)[0]?.item
    if (!nearest) return
    if (nearest.target) onTap(nearest.target)
    if (nearest.effect === 'lamp') {
      switchLamp(!lampOn)
      render()
    } else if (nearest.effect !== 'assistant') {
      // 비서의 반응은 화면이 hop()으로 부른다.
      play(nearest.effect)
    }
  }

  canvas.addEventListener('click', tap)
  addEventListener('pointermove', followPointer)
  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()
  if (!still) renderer.setAnimationLoop(render)

  return {
    setScene,
    setSky,
    hop: () => play('assistant'),
    celebrate,
    dispose() {
      renderer.setAnimationLoop(null)
      observer.disconnect()
      removeEventListener('pointermove', followPointer)
      world.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.LineSegments)) return
        object.geometry.dispose()
        for (const surface of [object.material].flat()) surface.dispose()
      })
      environment.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    },
  }
}
