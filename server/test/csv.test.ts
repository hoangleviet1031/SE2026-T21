import { describe, expect, it } from 'vitest';
import { BOM, escapeCell, toCsv } from '../src/lib/csv';

// CSV cho Excel (design §4.6, §9): RFC 4180, chống CSV injection, BOM UTF-8. Ticket TV3-09.

describe('escapeCell', () => {
  it('chuỗi thường giữ nguyên, kể cả tiếng Việt', () => {
    expect(escapeCell('Nguyễn Văn Á')).toBe('Nguyễn Văn Á');
  });

  it('có dấu phẩy, ngoặc kép, xuống dòng thì bọc ngoặc kép, ngoặc kép bên trong nhân đôi', () => {
    expect(escapeCell('Hà Nội, Việt Nam')).toBe('"Hà Nội, Việt Nam"');
    expect(escapeCell('nói "xin chào"')).toBe('"nói ""xin chào"""');
    expect(escapeCell('dòng 1\ndòng 2')).toBe('"dòng 1\ndòng 2"');
    expect(escapeCell('dòng 1\r\ndòng 2')).toBe('"dòng 1\r\ndòng 2"');
  });

  it('chuỗi bắt đầu bằng = + - @ (và tab, CR theo OWASP) có thêm tiền tố \' để Excel không chạy công thức', () => {
    expect(escapeCell('=1+1')).toBe("'=1+1");
    expect(escapeCell('+84 912')).toBe("'+84 912");
    expect(escapeCell('-gạch đầu dòng')).toBe("'-gạch đầu dòng");
    expect(escapeCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(escapeCell('\tthụt lề')).toBe("'\tthụt lề");
  });

  it('chống injection rồi mới escape: công thức có dấu phẩy vẫn bọc ngoặc kép', () => {
    expect(escapeCell('=HYPERLINK("http://x","bấm")')).toBe('"\'=HYPERLINK(""http://x"",""bấm"")"');
  });

  it('số (kể cả số âm) giữ nguyên để Excel còn coi là số; boolean, null, undefined', () => {
    expect(escapeCell(-5)).toBe('-5');
    expect(escapeCell(3.25)).toBe('3.25');
    expect(escapeCell(0)).toBe('0');
    expect(escapeCell(true)).toBe('true');
    expect(escapeCell(null)).toBe('');
    expect(escapeCell(undefined)).toBe('');
    expect(escapeCell('')).toBe('');
  });
});

describe('toCsv', () => {
  it('mở đầu bằng BOM, mỗi dòng kết thúc CRLF, ô cách nhau bằng dấu phẩy', () => {
    const csv = toCsv([
      ['id', 'tên'],
      ['r1', 'An, Bình'],
      ['r2', null],
    ]);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(BOM).toBe('﻿');
    expect(csv).toBe(`${BOM}id,tên\r\nr1,"An, Bình"\r\nr2,\r\n`);
  });

  it('không có dòng nào thì chỉ có BOM', () => {
    expect(toCsv([])).toBe(BOM);
  });
});
