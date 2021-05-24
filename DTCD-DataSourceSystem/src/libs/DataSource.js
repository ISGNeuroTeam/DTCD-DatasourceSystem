export class DataSource {
  #iterator;
  #filterObject;

  constructor(iterator, filterObject) {
    this.#iterator = iterator;
    this.#filterObject = filterObject ? filterObject : {};
  }
  [Symbol.asyncIterator]() {
    return this;
  }

  async next() {
    while (true) {
      const {value, done} = await this.#iterator.next();
      let filterPassed = true;
      if (typeof value === 'undefined' || done) {
        return {value, done};
      }
      for (let key of Object.keys(this.#filterObject)) {
        if (
          typeof value[key] === 'undefined' ||
          !String(value[key]).includes(String(this.#filterObject[key]))
        ) {
          filterPassed = false;
          break;
        }
      }
      if (filterPassed) {
        return {value, done};
      }
    }
  }

  filter(expression) {
    // TODO: expression -> filterObject
    const filterObject = expression;
    return new DataSource(this, filterObject);
  }

  getRecords(number) {
    let count = 0;
    const result = [];
    for (let record of this) {
      if (typeof number !== 'undefined' && count >= number) break;
      else {
        result.push(record);
        count++;
      }
    }
    return Promise.all(result).then(results => {
      return results.map(({value}) => value);
    });
  }

  toString() {
    return 'DataSource';
  }

  toString() {
    return `DataSource object`;
  }
}
