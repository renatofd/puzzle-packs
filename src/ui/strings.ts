/**
 * Textos fixos do kit (menu, árvore). O padrão é português; um jogo
 * localizado troca com `setKitText` antes de criar a interface.
 */
export const kitText = {
  menu: 'Menu',
  close: 'Fechar',
  tabOptions: 'Opções',
  tabStats: 'Estatísticas',
  tabAchievements: 'Conquistas',
  tabSave: 'Save',
  notationShort: 'Curta (1.5M)',
  notationScientific: 'Científica (1.5e6)',
  notationEngineering: 'Engenharia (1.5e6, 15e6)',
  masterVolume: 'Volume geral',
  sfxVolume: 'Efeitos sonoros',
  musicVolume: 'Música',
  effects: 'Partículas e efeitos',
  screenShakeOn: 'Tremida de tela: ligada',
  screenShakeOff: 'Tremida de tela: desligada',
  notation: 'Notação: {0}',
  example: 'Exemplo: {0}',
  playTime: 'Tempo de jogo',
  sinceReset: 'Desde o último reset',
  totalEarned: '{0}: total ganho',
  upgradesBought: 'Upgrades comprados',
  achievements: 'Conquistas',
  xOfY: '{0} de {1}',
  secretAchievement: 'Conquista secreta.',
  saveInfo: 'O jogo salva sozinho a cada 10 segundos e ao fechar a aba.',
  saveNow: 'Salvar agora',
  saved: 'Jogo salvo.',
  exportSave: 'Exportar (copiar código)',
  exported: 'Código do save copiado. Guarde-o num lugar seguro.',
  exportFailed: 'O navegador não deixou copiar. Tente de novo depois de clicar na página.',
  importSave: 'Importar (colar código)',
  importUnsupported: 'Este navegador não permite ler a área de transferência.',
  imported: 'Save importado.',
  importFailed: 'Não deu para importar: copie o código do save e permita colar.',
  wipeSave: 'Apagar save',
  wipeConfirm: 'Clique de novo para apagar tudo',
  treeHiddenHint: 'Compre um nó vizinho para revelar.',
  treeLevel: 'Nível {0}',
  treeCost: 'Custo: {0} {1}',
  treeLocked: 'Bloqueado',
  treeAvailable: 'Recursos insuficientes',
  treeAffordable: 'Clique para comprar',
  treeMaxed: 'Nível máximo',
};

export type KitTextKey = keyof typeof kitText;

export function setKitText(partial: Partial<Record<KitTextKey, string>>): void {
  Object.assign(kitText, partial);
}

/** Troca {0}, {1}... pelos argumentos. */
export function fill(template: string, ...args: Array<string | number>): string {
  return template.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? ''));
}
