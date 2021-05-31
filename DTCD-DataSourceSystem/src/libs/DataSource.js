export class DataSource {
  constructor(iterable, cb = (v, d) => ({ value: v, done: d })) {
    this.iterable = iterable;
    this.transform = cb;
  }

  [Symbol.iterator]() {
    const iterator = this.iterable[Symbol.iterator]();
    const transform = this.transform;
    return {
      iterator,
      transform,
      next() {
        let value, done;
        do {
          let { value: v, done: d } = this.iterator.next();
          const transformed = this.transform(v, d);
          value = transformed.value;
          done = transformed.done;
        } while (typeof value === 'undefined' && !done);
        return { value, done };
      },
    };
  }

  filter(expression) {
    // TODO: expression -> filterObject
    const filterData = expression;

    return new DataSource(this.iterable, function filterFunc(value, done) {
      if (typeof value === 'undefined') return { done };
      else if (typeof value === 'object') {
        if (typeof filterData !== 'object') {
          throw new Error('Error: Incorrect filter expression, need "object" type');
        }
        let passed = true;
        for (let key of Object.keys(filterData)) {
          if (
            typeof value[key] === 'undefined' ||
            !String(value[key]).includes(String(filterData[key]))
          )
            passed = false;
        }
        return passed ? { value, done } : { done };
      } else {
        if (typeof filterData === 'object') {
          throw new Error('Error: Incorrect filter expression, need not "object" type');
        }
        return String(value).includes(String(filterData)) ? { value, done } : { done };
      }
    });
  }

  getRecords(number) {
    let count = 0;
    const result = [];
    for (let record of this) {
      result.push(record);
      count++;
      if (typeof number !== 'undefined' && count >= number) break; // After "for-of" iteration record already cached, also return this
    }
    return new DataSource(result);
  }

  toArray() {
    return Array.from(this);
  }

  toString() {
    return `DataSource object`;
  }
}
