import {
  SystemPlugin,
  LogSystemAdapter,
  StorageSystemAdapter,
  EventSystemAdapter,
} from '../../DTCD-SDK';
// import { DataSource } from './libs/DataSource';
import pluginMeta from './Plugin.Meta';

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
    this.#logSystem = new LogSystemAdapter('0.4.0', guid, pluginMeta.name);
    this.#storageSystem = new StorageSystemAdapter('0.4.0');
    this.#eventSystem = new EventSystemAdapter('0.3.0', guid);
    this.#eventSystem.registerPluginInstance(this, []);
    this.#extensions = this.getExtensions(pluginMeta.name);

    this.#sources = {};
    this.#tokens = {};

    this.#eventSystem.subscribe(
      this.#storageSystem.getGUID(),
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
      const { datasourceParams, type } = this.#sources[source];
      sources[source] = { datasourceParams, type };
    }
    return { sources };
  }

  setPluginConfig(config = {}) {
    if (config.sources)
      for (let source in config.sources) {
        const { datasourceParams } = config.sources[source];
        this.createDataSource(source, config.sources[source].type, datasourceParams);
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

  createDataSource(name, type, datasourceParams) {
    this.#logSystem.debug(
      `Trying to create new '${type}' DataSource with name '${name}' and params: ${JSON.stringify(
        datasourceParams
      )}`
    );
    try {
      if (typeof type !== 'string' && typeof type !== 'string') {
        this.#logSystem.error(
          `DataSourceSystem.createDataSource invoked with not String params: type - "${type}", name - "${name}"`
        );
        throw new Error('"type" and "name" arguments type must be string');
      }

      if (this.#sources.hasOwnProperty(name)) {
        this.#logSystem.error(`Datasource with name '${name}' already exists!`);
        console.error(`Datasource with name '${name}' already exists!`);
        return;
      }

      const { plugin: DataSourcePlugin } = this.#extensions.find(
        ext => ext.plugin.getExtensionInfo().type.toLowerCase() === type.toLowerCase()
      );

      if (!DataSourcePlugin) {
        this.#logSystem.error(`Couldn't find extension with type - "${type}"`);
        throw new Error(`Cannot find "${type}" DataSource`);
      }
      this.#logSystem.debug(`Found extension plugin by type`);

      // DATASOURCE-PLUGIN
      const dataSource = new DataSourcePlugin(datasourceParams);
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

      this.#sources[name] = { source: dataSource, datasourceParams, type, status: 'new' };
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
    this.#logSystem.debug(`Executing DataSource '${name}'`);
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
    this.#logSystem.debug(
      `Trying to edit DataSource '${name}' with new parameters: ${JSON.stringify(params)}`
    );
    this.#sources[name].status = 'new';
    this.#removeDataSourceTokens(name);
    const { queryString } = params;
    if (queryString) {
      const processedString = this.#processQuerySting(name, queryString);
      params.queryString = processedString;
    }
    this.#sources[name].datasourceParams = { ...this.#sources[name].datasourceParams, ...params };
    this.#sources[name].source.editParams(params);
    this.#eventSystem.publishEvent(`DataSourceEdited`, {
      dataSource: name,
    });
    this.#runDataSource(name);
    this.#logSystem.info(`DataSource '${name}' params were edited successfully`);
  }

  runDataSource(name) {
    const { queryString } = this.#sources[name].datasourceParams;
    const processedString = this.#processQuerySting(name, queryString);
    this.#sources[name].source.editParams({ queryString: processedString });
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
    this.#logSystem.debug(`Removing DataSource '${dataSourceName}' tokens`);
    for (let token in this.#tokens) {
      const index = this.#tokens[token].indexOf(dataSourceName);
      if (index !== -1) this.#tokens[token].splice(index, 1);
      if (this.#tokens[token].length === 0) delete this.#tokens[token];
    }
  }

  #processQuerySting(dataSourceName, queryString) {
    this.#logSystem.debug(`Processing DataSources '${dataSourceName}' queryString`);
    const regexp = /\$.*?\$/g;
    const tokensWithDollars = [...queryString.matchAll(regexp)].map(prop => prop[0]);
    const tokens = tokensWithDollars.map(prop => prop.replaceAll('$', ''));
    this.#logSystem.debug(`Found tokens in queryString: ${JSON.stringify(tokens)}`);
    if (tokens.length > 0) {
      tokens.forEach(token => {
        const tokenValue = this.#storageSystem.tokenStorage.getRecord(token);
        this.#logSystem.debug(
          `Replacing token '${token}' with value '${tokenValue}' in queryString`
        );
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
    this.#logSystem.info(`Removing DataSource '${name}'`);
    delete this.#sources[name];
  }

  getDataSourceList() {
    return this.#sources;
  }
}
