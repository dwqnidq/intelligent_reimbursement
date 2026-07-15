import {
  classifyFileName,
  isExtractableContainer,
  isRecognizableKind,
} from './feishu-file.classifier';

describe('classifyFileName', () => {
  it('classifies images and pdf', () => {
    expect(classifyFileName('a.JPG')).toBe('image');
    expect(classifyFileName('b.png')).toBe('image');
    expect(classifyFileName('c.webp')).toBe('image');
    expect(classifyFileName('11.4.jepg')).toBe('image');
    expect(classifyFileName('d.pdf')).toBe('pdf');
  });

  it('classifies zip and other', () => {
    expect(classifyFileName('pack.zip')).toBe('zip');
    expect(classifyFileName('note.docx')).toBe('other');
  });
});

describe('isRecognizableKind', () => {
  it('returns true only for image and pdf', () => {
    expect(isRecognizableKind('image')).toBe(true);
    expect(isRecognizableKind('pdf')).toBe(true);
    expect(isRecognizableKind('zip')).toBe(false);
    expect(isRecognizableKind('other')).toBe(false);
  });
});

describe('isExtractableContainer', () => {
  it('returns true only for zip', () => {
    expect(isExtractableContainer('zip')).toBe(true);
    expect(isExtractableContainer('folder')).toBe(false);
    expect(isExtractableContainer('pdf')).toBe(false);
  });
});
