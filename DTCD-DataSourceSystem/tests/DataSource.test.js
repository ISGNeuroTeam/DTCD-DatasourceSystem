import {DataSource} from './../src/libs/DataSource';

describe('DataSource with Range function', () => {
  function Range(from, to, operation = '-1') {
    return {
      current: from,
      last: to,
      next() {
        if (this.current <= this.last) {
          this.current++;
          return {done: false, value: {number: eval(`${this.current}${operation}`)}};
        } else {
          return {done: true};
        }
      },
    };
  }

  describe('ExteranlSourceIterator is a Array of numbers 1-8', () => {
    const expected = [
      {number: 1},
      {number: 2},
      {number: 3},
      {number: 4},
      {number: 5},
      {number: 6},
      {number: 7},
      {number: 8},
    ];

    it('DataSource iterator 1', () => {
      const dataSource = new DataSource(Range(2, 8));
      let res = [{number: 1}];
      for (let rec of dataSource) {
        res.push(rec);
      }
      expect(res).toEqual(expected);
    });

    it('DataSource iterator 2', () => {
      const dataSource = new DataSource(Range(3, 8));
      let res = [{number: 1}, {number: 2}];
      for (let rec of dataSource) {
        res.push(rec);
      }
      expect(res).toEqual(expected);
    });

    it('DataSource iterator filter from constructor', () => {
      const dataSource = new DataSource(Range(1, 8), {number: 3});
      let res = [];
      for (let rec of dataSource) {
        res.push(rec);
      }
      expect(res).toEqual([expected[2]]);
    });
  });
  describe('ExteranlSourceIterator is a Array of numbers 1-8 with honest filter method', () => {
    const sample = [
      {number: 3},
      {number: 0},
      {number: 3},
      {number: 0},
      {number: 3},
      {number: 0},
      {number: 3},
      {number: 0},
    ];

    it('DataSource iterator filter 1', () => {
      const dataSource = new DataSource(Range(1, 8, '%2*3')).filter({number: 3});
      let res = [];
      for (let rec of dataSource) {
        res.push(rec);
      }
      expect(res).toEqual(sample.filter(({number}) => number === 3));
    });

    it('DataSource iterator filter 1 + getRows', () => {
      const dataSource = new DataSource(Range(1, 8, '%2*3'), {number: 3});
      const res = dataSource.getRecords(3);
      expect(res).toEqual(sample.filter(({number}) => number === 3).slice(0, 3));
    });
  });
});
