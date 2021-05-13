import { BaseAdapter } from './BaseAdapter';

/**
 * DatasourceSystem adapter class.
 * @class @extends BaseAdapter
 */
export class DatasourceSystemAdapter extends BaseAdapter {

  /**
   * Initialize DatasourceSystemAdapter instance.
   * @constructor
   */
  constructor() {
    super();
    this.instance = this.getSystem('DatasourceSystem');
  }

  /**
   * List of available datasource types.
   * @property @public
   * @returns {string[]} Datasource types list.
   */
  get datasourceTypes () {
    return this.instance.datasourceTypes;
  }

  /**
   * Create a datasource of a specific type.
   * @method @public
   * @param {string} type Datasource type name.
   * @returns {Object} Datasource class instance.
   */
  createDatasource (type) {
    return this.instance.createDatasource(type);
  }

}
