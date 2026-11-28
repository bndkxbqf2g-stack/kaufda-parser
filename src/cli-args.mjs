export function parseCliArgs(argv = []) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) {
      result._.push(item);
      continue;
    }
    const [key, inline] = item.slice(2).split('=', 2);
    if (inline != null) {
      result[key] = inline;
    } else if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) {
      result[key] = true;
    } else {
      result[key] = argv[++index];
    }
  }
  return result;
}
