import * as THREE from 'three'

export interface BurstOptions {
  origin: THREE.Vector3
  colors: string[]
  count: number
  /** 초당 이동 거리. 위로 솟는 속도와 옆으로 퍼지는 속도. */
  rise: number
  spread: number
  gravity: number
  seconds: number
}

interface Particle {
  position: THREE.Vector3
  velocity: THREE.Vector3
  spin: number
  age: number
  seconds: number
  gravity: number
}

/** 미리 만든 조각을 돌려쓰는 입자 묶음. */
export function createBurst(geometry: THREE.BufferGeometry, capacity: number, parent: THREE.Object3D) {
  const surface = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false })
  const instances = new THREE.InstancedMesh(geometry, surface, capacity)
  instances.frustumCulled = false
  instances.visible = false
  parent.add(instances)

  const particles: (Particle | null)[] = Array.from({ length: capacity }, () => null)
  const pose = new THREE.Object3D()
  const tint = new THREE.Color()
  let next = 0

  function hide(index: number) {
    pose.scale.setScalar(0)
    pose.updateMatrix()
    instances.setMatrixAt(index, pose.matrix)
  }
  for (let index = 0; index < capacity; index += 1) {
    hide(index)
    instances.setColorAt(index, tint.set('#fff'))
  }

  return {
    emit({ origin, colors, count, rise, spread, gravity, seconds }: BurstOptions) {
      for (let index = 0; index < count; index += 1) {
        const angle = Math.random() * Math.PI * 2
        const speed = spread * (0.4 + Math.random() * 0.6)
        particles[next] = {
          position: origin.clone(),
          velocity: new THREE.Vector3(
            Math.cos(angle) * speed,
            rise * (0.6 + Math.random() * 0.4),
            Math.sin(angle) * speed,
          ),
          spin: Math.random() * 8 - 4,
          age: 0,
          seconds: seconds * (0.7 + Math.random() * 0.3),
          gravity,
        }
        instances.setColorAt(next, tint.set(colors[index % colors.length]))
        next = (next + 1) % capacity
      }
      instances.instanceColor!.needsUpdate = true
      instances.visible = true
    },
    update(elapsed: number) {
      if (!instances.visible) return
      let alive = false
      particles.forEach((particle, index) => {
        if (!particle) return
        particle.age += elapsed
        if (particle.age >= particle.seconds) {
          particles[index] = null
          hide(index)
          return
        }
        alive = true
        particle.velocity.y -= particle.gravity * elapsed
        particle.position.addScaledVector(particle.velocity, elapsed)
        const life = particle.age / particle.seconds
        pose.position.copy(particle.position)
        pose.rotation.set(0, particle.spin * particle.age * 0.5, Math.sin(particle.spin * particle.age) * 0.5)
        pose.scale.setScalar(Math.min(1, life * 8) * Math.min(1, (1 - life) * 3))
        pose.updateMatrix()
        instances.setMatrixAt(index, pose.matrix)
      })
      instances.instanceMatrix.needsUpdate = true
      instances.visible = alive
    },
  }
}

export function heartGeometry(size: number) {
  const shape = new THREE.Shape()
  shape.moveTo(0, -1)
  shape.bezierCurveTo(-1.6, 0.1, -0.9, 1.2, 0, 0.5)
  shape.bezierCurveTo(0.9, 1.2, 1.6, 0.1, 0, -1)
  return new THREE.ShapeGeometry(shape, 10).scale(size, size, size)
}
