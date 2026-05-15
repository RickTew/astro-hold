export const Config = {
  WORLD: { LEFT: -600, RIGHT: 600, TOP: 200, BOTTOM: -200 },
  DEFENDER_MAX_X: -200,
  ATTACKER_MIN_X: 200,
  GRID_CELL: 50,
  START_CREDITS: 1000,  // testing budget — production should be lower (suggest 200-300)
  TURN_INTERVAL: 0.65,   // seconds per battle turn — also drives unit move speed
  POWER_CORE: { X: -550, Y: 0, HP: 100, RADIUS: 18 },

  STRUCTURES: {
    turret: { cost: 30, hp: 80,  damage: 15, range: 200, fireInterval: 2, label: 'Turret 30cr' },
    cannon: { cost: 60, hp: 120, damage: 40, range: 280, fireInterval: 4, label: 'Cannon 60cr' },
    wall:   { cost: 20, hp: 300, damage: 0,  range: 0,   fireInterval: 0, label: 'Wall   20cr' },
    mine:   { cost: 20, hp: 50,  damage: 60, range: 60,  fireInterval: 0, label: 'Mine   20cr' },
  },

  UNITS: {
    scout:  { cost: 20, hp: 120, speed: 130, damage: 10, range: 280, aoeRadius: 0,  label: 'Scout',  color: 0x4488ff },
    tank:   { cost: 50, hp: 200, speed: 44,  damage: 25, range: 200, aoeRadius: 0,  label: 'Tank',   color: 0xff4444 },
    bomber: { cost: 60, hp: 80,  speed: 70,  damage: 35, range: 160, aoeRadius: 80, label: 'Bomber', color: 0xff8800 },
    drone:  { cost: 30, hp: 20,  speed: 160, damage: 8,  range: 350, aoeRadius: 0,  label: 'Drone',  color: 0x44ffff },
  },
} as const

export type StructureType = keyof typeof Config.STRUCTURES
export type UnitType = keyof typeof Config.UNITS
