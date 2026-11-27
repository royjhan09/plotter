/** Public stand-in for the sprout-bot's wardrobe (in Plotter's private folder): empty. */
export const COSTUMES = false

export interface CostumePart {
  id: string
  label: string
  fits: string
  svg: string
}
export type CostumeSlot = 'hat' | 'eyes' | 'neck' | 'hand'

export const BODY_COLORS: { id: string; label: string }[] = []
const NONE: CostumePart = { id: 'none', label: 'Nothing', fits: 'anyone', svg: '' }
export const WARDROBE: Record<CostumeSlot, CostumePart[]> = { hat: [NONE], eyes: [NONE], neck: [NONE], hand: [NONE] }
export const SLOT_LABEL: Record<CostumeSlot, string> = { hat: 'On its head', eyes: 'Eyes', neck: 'Neck', hand: 'Holding' }
export const wardrobeBrief = (): string => ''
export const partOf = (_slot: CostumeSlot, _id: string | undefined): CostumePart => NONE
export const stageOf = (replies: number): 0 | 1 | 2 => (replies < 5 ? 0 : replies < 40 ? 1 : 2)
export const STAGE_LABEL = ['Seedling', 'Sprout', 'In flower']
