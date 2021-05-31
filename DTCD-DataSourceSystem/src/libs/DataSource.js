export class DataSource {
  constructor(iterable, filterObject) {
    this.iterable = iterable;
    this.filterObject = filterObject ? filterObject : {};
  }

  [Symbol.iterator]() {
    const iterator = this.iterable[Symbol.iterator].apply(this.iterable);
    const filterObject = this.filterObject;
    return {
      iterator,
      filterObject,
      next() {
        mainloop: while (true) {
          const { value, done } = this.iterator.next();
          let filterPassed = true;
          if (typeof value === 'undefined' || done) {
            return { value, done };
          }
          for (let key of Object.keys(this.filterObject)) {
            if (
              typeof value[key] === 'undefined' ||
              !String(value[key]).includes(String(this.filterObject[key]))
            ) {
              filterPassed = false;
              continue mainloop;
            }
          }
          return { value, done };
        }
      },
    };
  }

  filter(expression) {
    // TODO: expression -> filterObject
    const filterObject = expression;
    return new DataSource(this.iterable, filterObject);
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
