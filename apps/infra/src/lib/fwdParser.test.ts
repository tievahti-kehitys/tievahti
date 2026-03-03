import { describe, it, expect } from 'vitest';
import { parseFWDFile } from './fwdParser';

const sampleFile = `IKuormitustapa    : 1         (2 + 2 buffers)
IAlkupiste        :        0 m
IPisteväli        :       50 m
J   Paalu Isk Kuorm   D0   D1   D2   D3   D4   D5   D6 Ilma Pint   Emod          Lat          Long      Time 
J       m Num    kN   µm   µm   µm   µm   µm   µm   µm   °C   °C    MPa                                     
D        0   2  46.8 2838 1453  816  393  225   99   51  4.1  2.7     61   6141.95869  02656.72021 18:19:48
D       50   2  47.4 1741  956  525  265  144   62   32  4.6  2.6    101   6141.93775  02656.68899 18:21:11
D      100   2  46.7 2375  841  245   92   66   28   15  4.4  3.1     73   6141.95934  02656.65867 18:22:26
D      155   2  36.3 5794 4774 1954  587  223   42   29  4.3  3.3     23   6141.98318  02656.62279 18:24:28
C  Comment at 155 m  Time: 18:24:35 :$GPGGA...`;

describe('parseFWDFile', () => {
  it('should parse all D lines and ignore other lines', () => {
    const points = parseFWDFile(sampleFile);
    expect(points).toHaveLength(4);
  });

  it('should parse station values correctly', () => {
    const points = parseFWDFile(sampleFile);
    expect(points[0].station).toBe(0);
    expect(points[1].station).toBe(50);
    expect(points[2].station).toBe(100);
    expect(points[3].station).toBe(155);
  });

  it('should parse measured values (Emod) correctly', () => {
    const points = parseFWDFile(sampleFile);
    expect(points[0].measuredValue).toBe(61);
    expect(points[1].measuredValue).toBe(101);
    expect(points[2].measuredValue).toBe(73);
    expect(points[3].measuredValue).toBe(23);
  });

  it('should convert NMEA latitude to decimal degrees', () => {
    const points = parseFWDFile(sampleFile);
    // 6141.95869 => 61 + 41.95869/60 = 61.69931...
    expect(points[0].latitude).toBeCloseTo(61.6993, 3);
  });

  it('should convert NMEA longitude to decimal degrees', () => {
    const points = parseFWDFile(sampleFile);
    // 02656.72021 => 26 + 56.72021/60 = 26.9453...
    expect(points[0].longitude).toBeCloseTo(26.9453, 3);
  });

  it('should return empty array for empty input', () => {
    expect(parseFWDFile('')).toEqual([]);
  });

  it('should skip lines that do not start with D', () => {
    const input = `H Header line
I Info line
B Block line
J Column header
C Comment`;
    expect(parseFWDFile(input)).toEqual([]);
  });
});
