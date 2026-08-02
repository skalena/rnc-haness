import pc from 'picocolors';

export const log = {
  ok: (m: string) => console.log(`  ${pc.green('✔')} ${m}`),
  warn: (m: string) => console.log(`  ${pc.yellow('⚠')} ${m}`),
  err: (m: string) => console.log(`  ${pc.red('✖')} ${m}`),
  info: (m: string) => console.log(`  ${pc.dim('ⓘ')} ${m}`),
  na: (m: string) => console.log(`  ${pc.dim('⊘')} ${m}`),
  step: (m: string) => console.log(`  ${pc.cyan('◆')} ${pc.bold(m)}`),
  plain: (m = '') => console.log(m),
  head: (m: string) => {
    console.log('');
    console.log(`  ${pc.bgCyan(pc.black(` ${m} `))}`);
    console.log('');
  },
};

export function die(message: string, code = 1): never {
  log.err(message);
  process.exit(code);
}
