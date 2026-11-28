import { describe, expect, it } from 'vitest';
import { blockKind, closeFences, handleEnter, indentLines, joinBlocks, mapClickToSource, openFence, renderBlock, splitBlocks, toggleCheckbox, wrapSelection } from './markdown';

describe('blocks', () => {
  it('splits on blank lines and round-trips', () => {
    const doc = '# Title\n\nFirst paragraph\nsecond line\n\n- a\n- b\n\n> quote\n';
    expect(splitBlocks(doc)).toEqual(['# Title', 'First paragraph\nsecond line', '- a\n- b', '> quote']);
    expect(joinBlocks(splitBlocks(doc))).toBe(doc);
  });
  it('keeps a fenced code block (with blank lines inside) as one block', () => {
    const doc = 'intro\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n\nafter\n';
    expect(splitBlocks(doc)).toEqual(['intro', '```js\nconst a = 1;\n\nconst b = 2;\n```', 'after']);
    expect(joinBlocks(splitBlocks(doc))).toBe(doc);
  });
  it('a fence directly after text starts its own block', () => {
    expect(splitBlocks('text\n```\ncode\n```\nmore')).toEqual(['text', '```\ncode\n```', 'more']);
  });
  it('an unclosed fence is closed when the block is left, so it cannot swallow what follows', () => {
    expect(openFence('```py\nx = 1')).toBe('```');
    expect(closeFences('```py\nx = 1')).toBe('```py\nx = 1\n```');
    expect(closeFences('plain')).toBe('plain');
    expect(splitBlocks(joinBlocks([closeFences('```\ncode'), 'next']))).toEqual(['```\ncode\n```', 'next']);
  });
  it('empty documents and blank blocks', () => {
    expect(splitBlocks('')).toEqual([]);
    expect(joinBlocks(['', '  ', 'a'])).toBe('a\n');
    expect(joinBlocks([''])).toBe('');
  });
  it('styles the raw block like its rendered form', () => {
    expect(blockKind('## Hi')).toBe('h2');
    expect(blockKind('```\nx')).toBe('code');
    expect(blockKind('plain')).toBe('');
  });
});

describe('Enter', () => {
  it('splits a paragraph at the caret', () => {
    expect(handleEnter('hello world', 5, 5)).toEqual({ kind: 'split', before: 'hello', after: ' world' });
    expect(handleEnter('hello', 5, 5)).toEqual({ kind: 'split', before: 'hello', after: '' });
  });
  it('continues bullet, numbered and task lists', () => {
    expect(handleEnter('- one', 5, 5)).toEqual({ kind: 'edit', value: '- one\n- ', caret: 8 });
    expect(handleEnter('1. one\n2. two', 13, 13)).toEqual({ kind: 'edit', value: '1. one\n2. two\n3. ', caret: 17 });
    expect(handleEnter('- [x] done', 10, 10)).toEqual({ kind: 'edit', value: '- [x] done\n- [ ] ', caret: 17 });
    expect(handleEnter('  - nested', 10, 10)).toEqual({ kind: 'edit', value: '  - nested\n  - ', caret: 15 });
  });
  it('an empty list item ends the list', () => {
    expect(handleEnter('- one\n- ', 8, 8)).toEqual({ kind: 'split', before: '- one', after: '' });
    expect(handleEnter('- ', 2, 2)).toEqual({ kind: 'split', before: '', after: '' });
  });
  it('splits a list item in the middle', () => {
    expect(handleEnter('- onetwo', 5, 5)).toEqual({ kind: 'edit', value: '- one\n- two', caret: 8 });
  });
  it('continues block quotes and ends them on an empty line', () => {
    expect(handleEnter('> a', 3, 3)).toEqual({ kind: 'edit', value: '> a\n> ', caret: 6 });
    expect(handleEnter('> a\n> ', 6, 6)).toEqual({ kind: 'split', before: '> a', after: '' });
  });
  it('code fences: the opener gets its closing fence, inside code Enter is a newline', () => {
    expect(handleEnter('```js', 5, 5)).toEqual({ kind: 'edit', value: '```js\n\n```', caret: 6 });
    expect(handleEnter('```js\nlet a;', 12, 12)).toEqual({ kind: 'default' });
    expect(handleEnter('```js\nlet a;\n```', 16, 16)).toEqual({ kind: 'split', before: '```js\nlet a;\n```', after: '' });
  });
  it('tables: a header row gets its separator, body rows continue, an empty row ends the table', () => {
    expect(handleEnter('| a | b |', 9, 9)).toEqual({ kind: 'edit', value: '| a | b |\n|---|---|\n| ', caret: 22 });
    expect(handleEnter('| a | b |\n|---|---|\n| 1 | 2 |', 29, 29)).toEqual({ kind: 'edit', value: '| a | b |\n|---|---|\n| 1 | 2 |\n| ', caret: 32 });
    expect(handleEnter('| a | b |\n|---|---|\n| ', 22, 22)).toEqual({ kind: 'split', before: '| a | b |\n|---|---|', after: '' });
    expect(renderBlock('| a | b |\n|---|---|\n| 1 | 2 |')).toContain('<td>1</td>');
  });
  it('replaces a selection', () => {
    expect(handleEnter('abcdef', 2, 4)).toEqual({ kind: 'split', before: 'ab', after: 'ef' });
  });
});

describe('editing shortcuts', () => {
  it('Tab / Shift+Tab indent list lines only', () => {
    expect(indentLines('- a', 3, 3, false)).toEqual({ value: '  - a', start: 5, end: 5 });
    expect(indentLines('  - a', 5, 5, true)).toEqual({ value: '- a', start: 3, end: 3 });
    expect(indentLines('plain', 2, 2, false)).toBeNull();
  });
  it('bold / italic wrap and unwrap', () => {
    expect(wrapSelection('say hi now', 4, 6, '**')).toEqual({ value: 'say **hi** now', start: 6, end: 8 });
    expect(wrapSelection('say **hi** now', 6, 8, '**')).toEqual({ value: 'say hi now', start: 4, end: 6 });
    expect(wrapSelection('x', 1, 1, '*')).toEqual({ value: 'x**', start: 2, end: 2 });
  });
});

describe('clicking a rendered block', () => {
  it('maps a rendered position back into the markdown source', () => {
    expect(mapClickToSource('# Hello world', 'Hello world', 5)).toBe(7);          // after "Hello"
    expect(mapClickToSource('some **bold** text', 'some bold text', 9)).toBe(11);  // after "bold", before the closing **
    expect(mapClickToSource('- one\n- two', 'one\ntwo', 7)).toBe(11);              // end of the list
    expect(mapClickToSource('abc', 'abc', 0)).toBe(0);
  });
  it('toggles the n-th task checkbox', () => {
    expect(toggleCheckbox('- [ ] a\n- [x] b\n- [ ] c', 1)).toBe('- [ ] a\n- [ ] b\n- [ ] c');
    expect(toggleCheckbox('- [ ] a\n- [x] b\n- [ ] c', 2)).toBe('- [ ] a\n- [x] b\n- [x] c');
    expect(toggleCheckbox('plain [ ] text', 0)).toBe('plain [ ] text');
  });
});

describe('rendering', () => {
  it('renders markdown, tasks and tables', () => {
    expect(renderBlock('# Hi')).toContain('<h1>Hi</h1>');
    expect(renderBlock('**b** and *i*')).toContain('<strong>b</strong>');
    expect(renderBlock('- [x] done')).toContain('data-nbcheck checked');
    expect(renderBlock('| a | b |\n|---|---|\n| 1 | 2 |')).toContain('<table class="tbl">');
    expect(renderBlock('line1\nline2')).toContain('<br>');
  });
  it('never executes raw HTML or javascript links', () => {
    const h = renderBlock('<script>alert(1)</script> <img src=x onerror=alert(1)>');
    expect(h).not.toContain('<script'); expect(h).not.toContain('<img');
    expect(renderBlock('[x](javascript:alert(1))')).not.toContain('javascript:');
    expect(renderBlock('[ok](https://example.com)')).toContain('rel="noopener noreferrer"');
  });
});
