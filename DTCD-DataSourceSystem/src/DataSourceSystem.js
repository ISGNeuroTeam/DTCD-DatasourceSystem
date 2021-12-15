import {
  SystemPlugin,
  LogSystemAdapter,
  StorageSystemAdapter,
  EventSystemAdapter,
} from '../../DTCD-SDK';
// import { DataSource } from './libs/DataSource';
import { pluginMeta } from '../package.json';

export class DataSourceSystem extends SystemPlugin {
  #guid;
  #extensions = [];
  #logSystem;
  #storageSystem;
  #eventSystem;
  #sources;
  #tokens;

  static getRegistrationMeta() {
    return pluginMeta;
  }

  constructor(guid) {
    super();
    this.#guid = guid;
    this.#logSystem = new LogSystemAdapter(guid, pluginMeta.name);
    this.#storageSystem = new StorageSystemAdapter();
    this.#eventSystem = new EventSystemAdapter(guid);
    this.#eventSystem.registerPluginInstance(this, []);
    this.#extensions = this.getExtensions(pluginMeta.name);

    this.#sources = {};
    this.#tokens = {};

    this.#eventSystem.subscribe(
      this.getGUID(this.getSystem('StorageSystem')),
      'TokenUpdate',
      guid,
      'processTokenUpdateEvent'
    );

    this.#eventSystem.registerEvent('DataSourceCreated');
    this.#eventSystem.registerEvent('DataSourceEdited');
    this.#eventSystem.registerEvent('DataSourceDeleted');

    this.#logSystem.debug(`DataSourceSystem instance created!`);
  }

  getPluginConfig() {
    const sources = {};
    for (let source in this.#sources) {
      const { initData, type } = this.#sources[source];
      sources[source] = { initData, type };
    }
    return { sources };
  }

  setPluginConfig(config = {}) {
    if (config.sources)
      for (let source in config.sources) {
        const { initData } = config.sources[source];
        this.createDataSource({ name: source, ...initData });
      }
  }

  getFormSettings() {}

  setFormSettings() {}

  beforeDelete() {}

  #toCache(keyRecord, data) {
    if (!this.#storageSystem.session.hasRecord(keyRecord)) {
      this.#storageSystem.session.addRecord(keyRecord, data);
      this.#logSystem.debug(`Added record to StorageSystem for ExternalSource`);
    } else this.#storageSystem.session.putRecord(keyRecord, data);
  }

  get dataSourceTypes() {
    return this.#extensions.map(ext => ext.plugin.getExtensionInfo().type);
  }

  createDataSource(initData) {
    this.#logSystem.debug(`DataSourceSystem start create createDataSource`);
    try {
      // !!!!! Refactor name of query string from 'original_otl to something general for all datasources in order to preprocess tokens correctly
      let { type, name } = initData;
      delete initData.name;

      if (typeof type !== 'string') {
        this.#logSystem.error(
          `DataSourceSystem.createDataSource invoked with not String params: type - "${type}", name - "${name}"`
        );
        throw new Error('Initial object should have "type" and "name" string properties');
      }

      if (this.#sources.hasOwnProperty(name)) {
        this.#logSystem.error(`Datasource with name '${name} already exists!`);
        // console.error(`Datasource with name '${name} already exists!`);
        return;
      }

      this.#logSystem.debug(
        `Started create of DataSource with type - "${type}" and name - "${name}"`
      );

      const { plugin: DataSourcePlugin } = this.#extensions.find(
        ext => ext.plugin.getExtensionInfo().type.toLowerCase() === type.toLowerCase()
      );

      if (!DataSourcePlugin) {
        this.#logSystem.error(`Couldn't find extension with type - "${type}"`);
        throw new Error(`Cannot find "${type}" DataSource`);
      }
      this.#logSystem.debug(`Found extension plugin by type`);

      // DATASOURCE-PLUGIN
      const dataSource = new DataSourcePlugin({ initData });
      this.#logSystem.debug(`ExternalSource instance created`);

      this.#eventSystem.registerEvent('DataSourceStatusUpdate', {
        dataSource: name,
        status: 'new',
      });

      this.#eventSystem.registerEvent('DataSourceStatusUpdate', {
        dataSource: name,
        status: 'failed',
      });

      this.#eventSystem.registerEvent('DataSourceStatusUpdate', {
        dataSource: name,
        status: 'success',
      });

      this.#sources[name] = { source: dataSource, initData, type, status: 'new' };
      this.#eventSystem.publishEvent(`DataSourceStatusUpdate`, {
        dataSource: name,
        status: 'new',
      });

      this.#eventSystem.publishEvent(`DataSourceCreated`, {
        dataSource: name,
      });

      this.#logSystem.debug(`ExternalSource instance inited`);

      this.runDataSource(name);

      return true;
    } catch (err) {
      this.#logSystem.error(err);
      throw new Error(err);
    }
  }

  #runDataSource(name) {
    this.#sources[name].source
      .init()
      .then(isInited => {
        if (!isInited) {
          this.#sources[name].status = 'failed';
          this.#eventSystem.publishEvent(`DataSourceStatusUpdate`, {
            dataSource: name,
            status: 'failed',
          });
          this.#logSystem.error(`Couldn't init ExternalSource instance`);
          throw new Error("Job isn't created");
        }
        return this.#sources[name].source.getData();
      })
      .then(data => {
        this.#toCache(name, data);

        this.#sources[name].status = 'success';

        this.#eventSystem.publishEvent(`DataSourceStatusUpdate`, {
          dataSource: name,
          status: 'success',
        });
      });
  }

  editDataSource(name, params) {
    this.#sources[name].status = 'new';
    this.#removeDataSourceTokens(name);
    const { original_otl } = params;
    const processed_otl = this.#processQuerySting(name, original_otl);
    this.#sources[name].initData = { ...this.#sources[name].initData, ...params };
    this.#sources[name].source.editParams({ ...params, original_otl: processed_otl });
    this.#eventSystem.publishEvent(`DataSourceEdited`, {
      dataSource: name,
    });
    this.#runDataSource(name);
  }

  runDataSource(name) {
    const { original_otl } = this.#sources[name].initData;
    const processed_otl = this.#processQuerySting(name, original_otl);
    this.#sources[name].source.editParams({ original_otl: processed_otl });
    this.#runDataSource(name);
  }

  processTokenUpdateEvent(eventData) {
    if (Object.keys(this.#sources).length !== 0) {
      const { token } = eventData;
      if (Array.isArray(this.#tokens[token])) {
        this.#tokens[token].forEach(dataSourceName => {
          this.runDataSource(dataSourceName);
        });
      }
    }
  }

  #removeDataSourceTokens(dataSourceName) {
    for (let token in this.#tokens) {
      const index = this.#tokens[token].indexOf(dataSourceName);
      if (index !== -1) this.#tokens[token].splice(index, 1);
      if (this.#tokens[token].length === 0) delete this.#tokens[token];
    }
  }

  #processQuerySting(dataSourceName, queryString) {
    const regexp = /\$.*?\$/g;
    const tokensWithDollars = [...queryString.matchAll(regexp)].map(prop => prop[0]);
    const tokens = tokensWithDollars.map(prop => prop.replaceAll('$', ''));
    if (tokens.length > 0) {
      tokens.forEach(token => {
        const tokenValue = this.#storageSystem.tokenStorage.getRecord(token);
        if (!tokenValue) {
          queryString = queryString.replaceAll(`$${token}$`, '');
        } else {
          queryString = queryString.replaceAll(`$${token}$`, tokenValue);
          if (Array.isArray(this.#tokens[token]) && !this.#tokens[token].includes(dataSourceName)) {
            this.#tokens[token].push(dataSourceName);
          } else {
            this.#tokens[token] = [];
            this.#tokens[token].push(dataSourceName);
          }
        }
      });
    }
    return queryString;
  }

  getDataSource(name) {
    if (this.#sources.hasOwnProperty(name)) return this.#sources[name];
    return null;
  }

  removeDataSource(name) {
    this.#eventSystem.publishEvent(`DataSourceDeleted`, {
      dataSource: name,
    });
    delete this.#sources[name];
  }

  getDataSourceList() {
    return this.#sources;
  }
}
