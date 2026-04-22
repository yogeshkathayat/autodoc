import pc from 'picocolors';

let verbose = false;

export function setVerbose(v: boolean): void {
  verbose = v;
}

export function log(msg: string): void {
  console.log(msg);
}

export function info(msg: string): void {
  console.log(`${pc.cyan('ℹ')} ${msg}`);
}

export function warn(msg: string): void {
  console.log(`${pc.yellow('⚠')} ${msg}`);
}

export function error(msg: string): void {
  console.error(`${pc.red('✖')} ${msg}`);
}

export function success(msg: string): void {
  console.log(`${pc.green('✓')} ${msg}`);
}

export function debug(msg: string): void {
  if (verbose) {
    console.log(`${pc.gray('•')} ${pc.gray(msg)}`);
  }
}
