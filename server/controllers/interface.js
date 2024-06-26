const interfaceModel = require('../models/interface.js');
const interfaceCatModel = require('../models/interfaceCat.js');
const interfaceCaseModel = require('../models/interfaceCase.js');
const followModel = require('../models/follow.js');
const groupModel = require('../models/group.js');
const _ = require('underscore');
const url = require('url');
const baseController = require('./base.js');
const yapi = require('../yapi.js');
const userModel = require('../models/user.js');
const projectModel = require('../models/project.js');
const jsondiffpatch = require('jsondiffpatch');
const formattersHtml = jsondiffpatch.formatters.html;
const showDiffMsg = require('../../common/diff-view.js');
const mergeJsonSchema = require('../../common/mergeJsonSchema');
const fs = require('fs-extra');
const path = require('path');
const { pathExistsSync } = require('fs-extra');
const { mkdirSync } = require('fs');
const nzip = require('node-zip-dir');
const { mkdirsSync } = require('fs-extra');
const https = require('https');
const http = require('http');
const rd = require('rd');
const { aesDecode } = require('../utils/token.js');

// const annotatedCss = require("jsondiffpatch/public/formatters-styles/annotated.css");
// const htmlCss = require("jsondiffpatch/public/formatters-styles/html.css");

function handleHeaders(values) {
  let isfile = false,
    isHaveContentType = false;
  if (values.req_body_type === 'form') {
    values.req_body_form.forEach(item => {
      if (item.type === 'file') {
        isfile = true;
      }
    });

    values.req_headers.map(item => {
      if (item.name === 'Content-Type') {
        item.value = isfile ? 'multipart/form-data' : 'application/x-www-form-urlencoded';
        isHaveContentType = true;
      }
    });
    if (isHaveContentType === false) {
      values.req_headers.unshift({
        name: 'Content-Type',
        value: isfile ? 'multipart/form-data' : 'application/x-www-form-urlencoded'
      });
    }
  } else if (values.req_body_type === 'json') {
    values.req_headers
      ? values.req_headers.map(item => {
        if (item.name === 'Content-Type') {
          item.value = 'application/json';
          isHaveContentType = true;
        }
      })
      : [];
    if (isHaveContentType === false) {
      values.req_headers = values.req_headers || [];
      values.req_headers.unshift({
        name: 'Content-Type',
        value: 'application/json'
      });
    }
  }
}

class interfaceController extends baseController {
  constructor(ctx) {
    super(ctx);
    this.Model = yapi.getInst(interfaceModel);
    this.catModel = yapi.getInst(interfaceCatModel);
    this.projectModel = yapi.getInst(projectModel);
    this.caseModel = yapi.getInst(interfaceCaseModel);
    this.followModel = yapi.getInst(followModel);
    this.userModel = yapi.getInst(userModel);
    this.groupModel = yapi.getInst(groupModel);
    this.protoIDMap = {};
    this.protoPBMap = {};

    const minLengthStringField = {
      type: 'string',
      minLength: 1
    };

    const addAndUpCommonField = {
      desc: 'string',
      status: 'string',
      req_query: [
        {
          name: 'string',
          value: 'string',
          example: 'string',
          desc: 'string',
          required: 'string'
        }
      ],
      req_headers: [
        {
          name: 'string',
          value: 'string',
          example: 'string',
          desc: 'string',
          required: 'string'
        }
      ],
      req_body_type: 'string',
      req_params: [
        {
          name: 'string',
          example: 'string',
          desc: 'string'
        }
      ],
      req_body_form: [
        {
          name: 'string',
          type: {
            type: 'string'
          },
          example: 'string',
          desc: 'string',
          required: 'string'
        }
      ],
      req_body_other: 'string',
      res_body_type: 'string',
      res_body: 'string',
      custom_field_value: 'string',
      api_opened: 'boolean',
      req_body_is_json_schema: 'string',
      res_body_is_json_schema: 'string',
      markdown: 'string',
      tag: 'array',
      req_id: 'string',
      req_pb: 'string',
      resp_id: 'string',
      resp_pb: 'string'
    };

    this.schemaMap = {
      add: Object.assign(
        {
          '*project_id': 'number',
          '*path': minLengthStringField,
          '*title': minLengthStringField,
          '*method': minLengthStringField,
          '*catid': 'number'
        },
        addAndUpCommonField
      ),
      up: Object.assign(
        {
          '*id': 'number',
          project_id: 'number',
          path: minLengthStringField,
          title: minLengthStringField,
          method: minLengthStringField,
          catid: 'number',
          switch_notice: 'boolean',
          message: minLengthStringField
        },
        addAndUpCommonField
      ),
      save: Object.assign(
        {
          project_id: 'number',
          catid: 'number',
          title: minLengthStringField,
          path: minLengthStringField,
          method: minLengthStringField,
          message: minLengthStringField,
          switch_notice: 'boolean',
          dataSync: 'string'
        },
        addAndUpCommonField
      )
    };
  }

  /**
   * 添加项目分组
   * @interface /interface/add
   * @method POST
   * @category interface
   * @foldnumber 10
   * @param {Number}   project_id 项目id，不能为空
   * @param {String}   title 接口标题，不能为空
   * @param {String}   path 接口请求路径，不能为空
   * @param {String}   method 请求方式
   * @param {Array}  [req_headers] 请求的header信息
   * @param {String}  [req_headers[].name] 请求的header信息名
   * @param {String}  [req_headers[].value] 请求的header信息值
   * @param {Boolean}  [req_headers[].required] 是否是必须，默认为否
   * @param {String}  [req_headers[].desc] header描述
   * @param {String}  [req_body_type] 请求参数方式，有["form", "json", "text", "xml"]四种
   * @param {Array} [req_params] name, desc两个参数
   * @param {Mixed}  [req_body_form] 请求参数,如果请求方式是form，参数是Array数组，其他格式请求参数是字符串
   * @param {String} [req_body_form[].name] 请求参数名
   * @param {String} [req_body_form[].value] 请求参数值，可填写生成规则（mock）。如@email，随机生成一条email
   * @param {String} [req_body_form[].type] 请求参数类型，有["text", "file"]两种
   * @param {String} [req_body_other]  非form类型的请求参数可保存到此字段
   * @param {String}  [res_body_type] 相应信息的数据格式，有["json", "text", "xml"]三种
   * @param {String} [res_body] 响应信息，可填写任意字符串，如果res_body_type是json,则会调用mock功能
   * @param  {String} [desc] 接口描述
   * @returns {Object}
   * @example ./api/interface/add.json
   */
  async add(ctx) {
    let params = ctx.params;

    if (!this.$tokenAuth) {
      let auth = await this.checkAuth(params.project_id, 'project', 'edit');

      if (!auth) {
        return (ctx.body = yapi.commons.resReturn(null, 40033, '没有权限'));
      }
    }
    params.method = params.method || 'GET';
    params.res_body_is_json_schema = _.isUndefined(params.res_body_is_json_schema)
      ? false
      : params.res_body_is_json_schema;
    params.req_body_is_json_schema = _.isUndefined(params.req_body_is_json_schema)
      ? false
      : params.req_body_is_json_schema;
    params.method = params.method.toUpperCase();
    params.req_params = params.req_params || [];
    params.res_body_type = params.res_body_type ? params.res_body_type.toLowerCase() : 'json';
    let http_path = url.parse(params.path, true);

    if (!yapi.commons.verifyPath(http_path.pathname)) {
      return (ctx.body = yapi.commons.resReturn(
        null,
        400,
        'path第一位必需为 /, 只允许由 字母数字-/_:.! 组成'
      ));
    }

    handleHeaders(params)

    params.query_path = {};
    params.query_path.path = http_path.pathname;
    params.query_path.params = [];
    Object.keys(http_path.query).forEach(item => {
      params.query_path.params.push({
        name: item,
        value: http_path.query[item]
      });
    });

    let checkRepeat = await this.Model.checkRepeat(params.project_id, params.path, params.method);

    if (checkRepeat > 0) {
      return (ctx.body = yapi.commons.resReturn(
        null,
        40022,
        '已存在的接口:' + params.path + '[' + params.method + ']'
      ));
    }

    let data = Object.assign(params, {
      uid: this.getUid(),
      add_time: yapi.commons.time(),
      up_time: yapi.commons.time()
    });

    yapi.commons.handleVarPath(params.path, params.req_params);

    if (params.req_params.length > 0) {
      data.type = 'var';
      data.req_params = params.req_params;
    } else {
      data.type = 'static';
    }

    // 新建接口的人成为项目dev  如果不存在的话
    // 命令行导入时无法获知导入接口人的信息，其uid 为 999999
    let uid = this.getUid();

    if (this.getRole() !== 'admin' && uid !== 999999) {
      let userdata = await yapi.commons.getUserdata(uid, 'dev');
      // 检查一下是否有这个人
      let check = await this.projectModel.checkMemberRepeat(params.project_id, uid);
      if (check === 0 && userdata) {
        await this.projectModel.addMember(params.project_id, [userdata]);
      }
    }

    let result = await this.Model.save(data);
    yapi.emitHook('interface_add', result).then();
    this.catModel.get(params.catid).then(cate => {
      let username = this.getUsername();
      let title = `<a href="/user/profile/${this.getUid()}">${username}</a> 为分类 <a href="/project/${params.project_id
        }/interface/api/cat_${params.catid}">${cate.name}</a> 添加了接口 <a href="/project/${params.project_id
        }/interface/api/${result._id}">${data.title}</a> `;

      yapi.commons.saveLog({
        content: title,
        type: 'project',
        uid: this.getUid(),
        username: username,
        typeid: params.project_id
      });
      this.projectModel.up(params.project_id, { up_time: new Date().getTime() }).then();
    });

    await this.autoAddTag(params);

    ctx.body = yapi.commons.resReturn(result);
  }

  /**
   * 保存接口数据，如果接口存在则更新数据，如果接口不存在则添加数据
   * @interface /interface/save
   * @method  post
   * @category interface
   * @foldnumber 10
   * @param {Number}   project_id 项目id，不能为空
   * @param {String}   title 接口标题，不能为空
   * @param {String}   path 接口请求路径，不能为空
   * @param {String}   method 请求方式
   * @param {Array}  [req_headers] 请求的header信息
   * @param {String}  [req_headers[].name] 请求的header信息名
   * @param {String}  [req_headers[].value] 请求的header信息值
   * @param {Boolean}  [req_headers[].required] 是否是必须，默认为否
   * @param {String}  [req_headers[].desc] header描述
   * @param {String}  [req_body_type] 请求参数方式，有["form", "json", "text", "xml"]四种
   * @param {Array} [req_params] name, desc两个参数
   * @param {Mixed}  [req_body_form] 请求参数,如果请求方式是form，参数是Array数组，其他格式请求参数是字符串
   * @param {String} [req_body_form[].name] 请求参数名
   * @param {String} [req_body_form[].value] 请求参数值，可填写生成规则（mock）。如@email，随机生成一条email
   * @param {String} [req_body_form[].type] 请求参数类型，有["text", "file"]两种
   * @param {String} [req_body_other]  非form类型的请求参数可保存到此字段
   * @param {String}  [res_body_type] 相应信息的数据格式，有["json", "text", "xml"]三种
   * @param {String} [res_body] 响应信息，可填写任意字符串，如果res_body_type是json,则会调用mock功能
   * @param  {String} [desc] 接口描述
   * @returns {Object}
   */
  async save(ctx) {
    let params = ctx.params;

    if (!this.$tokenAuth) {
      let auth = await this.checkAuth(params.project_id, 'project', 'edit');
      if (!auth) {
        return (ctx.body = yapi.commons.resReturn(null, 40033, '没有权限'));
      }
    }
    params.method = params.method || 'GET';
    params.method = params.method.toUpperCase();

    let http_path = url.parse(params.path, true);

    if (!yapi.commons.verifyPath(http_path.pathname)) {
      return (ctx.body = yapi.commons.resReturn(
        null,
        400,
        'path第一位必需为 /, 只允许由 字母数字-/_:.! 组成'
      ));
    }

    let result = await this.Model.getByPath(params.project_id, params.path, params.method, '_id res_body');

    if (result.length > 0) {
      result.forEach(async item => {
        params.id = item._id;
        // console.log(this.schemaMap['up'])
        let validParams = Object.assign({}, params)
        let validResult = yapi.commons.validateParams(this.schemaMap['up'], validParams);
        if (validResult.valid) {
          let data = Object.assign({}, ctx);
          data.params = validParams;

          if (params.res_body_is_json_schema && params.dataSync === 'good') {
            try {
              let new_res_body = yapi.commons.json_parse(params.res_body)
              let old_res_body = yapi.commons.json_parse(item.res_body)
              data.params.res_body = JSON.stringify(mergeJsonSchema(old_res_body, new_res_body), null, 2);
            } catch (err) { }
          }
          await this.up(data);
        } else {
          return (ctx.body = yapi.commons.resReturn(null, 400, validResult.message));
        }
      });
    } else {
      let validResult = yapi.commons.validateParams(this.schemaMap['add'], params);
      if (validResult.valid) {
        let data = {};
        data.params = params;
        await this.add(data);
      } else {
        return (ctx.body = yapi.commons.resReturn(null, 400, validResult.message));
      }
    }
    ctx.body = yapi.commons.resReturn(result);
    // return ctx.body = yapi.commons.resReturn(null, 400, 'path第一位必需为 /, 只允许由 字母数字-/_:.! 组成');
  }

  async autoAddTag(params) {
    //检查是否提交了目前不存在的tag
    let tags = params.tag;
    if (tags && Array.isArray(tags) && tags.length > 0) {
      let projectData = await this.projectModel.get(params.project_id);
      let tagsInProject = projectData.tag;
      let needUpdate = false;
      if (tagsInProject && Array.isArray(tagsInProject) && tagsInProject.length > 0) {
        tags.forEach(tag => {
          if (!_.find(tagsInProject, item => {
            return item.name === tag;
          })) {//tag不存在
            needUpdate = true;
            tagsInProject.push({
              name: tag,
              desc: tag
            });
          }
        });
      } else {
        needUpdate = true
        tagsInProject = []
        tags.forEach(tag => {
          tagsInProject.push({
            name: tag,
            desc: tag
          });
        });
      }
      if (needUpdate) {//需要更新tag
        let data = {
          tag: tagsInProject,
          up_time: yapi.commons.time()
        };
        await this.projectModel.up(params.project_id, data);
      }
    }
  }

  /**
   * 获取项目分组
   * @interface /interface/get
   * @method GET
   * @category interface
   * @foldnumber 10
   * @param {Number}   id 接口id，不能为空
   * @returns {Object}
   * @example ./api/interface/get.json
   */
  async get(ctx) {
    let params = ctx.params;
    if (!params.id) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '接口id不能为空'));
    }

    try {
      let result = await this.Model.get(params.id);
      if (this.$tokenAuth) {
        if (params.project_id !== result.project_id) {
          ctx.body = yapi.commons.resReturn(null, 400, 'token有误')
          return;
        }
      }
      // console.log('result', result);
      if (!result) {
        return (ctx.body = yapi.commons.resReturn(null, 490, '不存在的'));
      }
      let userinfo = await this.userModel.findById(result.uid);
      let project = await this.projectModel.getBaseInfo(result.project_id);
      if (project.project_type === 'private') {
        if ((await this.checkAuth(project._id, 'project', 'view')) !== true) {
          return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
        }
      }
      yapi.emitHook('interface_get', result).then();
      result = result.toObject();
      if (userinfo) {
        result.username = userinfo.username;
      }
      if (result.method == "CONN" || result.method == "CGI") {
        // req_id
        if (result.req_id) {
          let req_id_meta = this.getID(result.project_id, result.req_id, true)
          if (req_id_meta.length > 0) {
            result.req_id_comment = req_id_meta[0].comment == "" ? "NONE" : req_id_meta[0].comment
          } else {
            result.req_id += "[MISSING]"
            result.req_id_comment = "NONE"
          }
        } else {
          result.req_id = "NONE"
          result.req_id_comment = "NONE"
        }
        // resp_id
        if (result.method == "CONN") {
          if (result.resp_id) {
            let resp_id_meta = this.getID(result.project_id, result.resp_id, true)
            if (resp_id_meta.length > 0) {
              result.resp_id_comment = resp_id_meta[0].comment == "" ? "NONE" : resp_id_meta[0].comment
            } else {
              result.resp_id += "[MISSING]"
              result.resp_id_comment = "NONE"
            }
          } else {
            result.resp_id = "NONE"
            result.resp_id_comment = "NONE"
          }
        }
        // req_pb
        if (result.req_pb) {
          let req_pb_meta = this.getPB(result.project_id, result.req_pb, true)
          if (req_pb_meta.length > 0) {
            result.req_pb_struct = req_pb_meta[0].struct == "" ? "NONE" : req_pb_meta[0].struct
          } else {
            result.req_pb_struct = result.req_pb + "[MISSING]"
          }
        } else {
          result.req_pb_struct = "NONE"
        }
        // resp_pb
        if (result.resp_pb) {
          let resp_pb_meta = this.getPB(result.project_id, result.resp_pb, true)
          if (resp_pb_meta.length > 0) {
            result.resp_pb_struct = resp_pb_meta[0].struct == "" ? "NONE" : resp_pb_meta[0].struct
          } else {
            result.resp_pb_struct = result.resp_pb + "[MISSING]"
          }
        } else {
          result.resp_pb_struct = "NONE"
        }
      }
      ctx.body = yapi.commons.resReturn(result);
    } catch (e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  /**
   * 接口列表
   * @interface /interface/list
   * @method GET
   * @category interface
   * @foldnumber 10
   * @param {Number}   project_id 项目id，不能为空
   * @param {Number}   page 当前页
   * @param {Number}   limit 每一页限制条数
   * @returns {Object}
   * @example ./api/interface/list.json
   */
  async list(ctx) {
    let project_id = ctx.params.project_id;
    let page = ctx.request.query.page || 1,
      limit = ctx.request.query.limit || 10;
    let status = ctx.request.query.status,
      tag = ctx.request.query.tag;
    let project = await this.projectModel.getBaseInfo(project_id);
    if (!project) {
      return (ctx.body = yapi.commons.resReturn(null, 407, '不存在的项目'));
    }
    if (project.project_type === 'private') {
      if ((await this.checkAuth(project._id, 'project', 'view')) !== true) {
        return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
      }
    }
    if (!project_id) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空'));
    }

    try {
      let result, count;
      if (limit === 'all') {
        result = await this.Model.list(project_id);
        count = await this.Model.listCount({ project_id });
      } else {
        let option = { project_id };
        if (status) {
          if (Array.isArray(status)) {
            option.status = { "$in": status };
          } else {
            option.status = status;
          }
        }
        if (tag) {
          if (Array.isArray(tag)) {
            option.tag = { "$in": tag };
          } else {
            option.tag = tag;
          }
        }

        result = await this.Model.listByOptionWithPage(option, page, limit);
        count = await this.Model.listCount(option);
      }


      ctx.body = yapi.commons.resReturn({
        count: count,
        total: Math.ceil(count / limit),
        list: result
      });
      yapi.emitHook('interface_list', result).then();
    } catch (err) {
      ctx.body = yapi.commons.resReturn(null, 402, err.message);
    }
  }

  async downloadCrx(ctx) {
    let filename = 'crossRequest.zip';
    let dataBuffer = yapi.fs.readFileSync(
      yapi.path.join(yapi.WEBROOT, 'static/attachment/cross-request.zip')
    );
    ctx.set('Content-disposition', 'attachment; filename=' + filename);
    ctx.set('Content-Type', 'application/zip');
    ctx.body = dataBuffer;
  }

  async listByCat(ctx) {
    let catid = ctx.request.query.catid;
    let page = ctx.request.query.page || 1,
      limit = ctx.request.query.limit || 10;
    let status = ctx.request.query.status,
      tag = ctx.request.query.tag;

    if (!catid) {
      return (ctx.body = yapi.commons.resReturn(null, 400, 'catid不能为空'));
    }
    try {
      let catdata = await this.catModel.get(catid);

      let project = await this.projectModel.getBaseInfo(catdata.project_id);
      if (project.project_type === 'private') {
        if ((await this.checkAuth(project._id, 'project', 'view')) !== true) {
          return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
        }
      }


      let option = { catid }
      if (status) {
        if (Array.isArray(status)) {
          option.status = { "$in": status };
        } else {
          option.status = status;
        }
      }
      if (tag) {
        if (Array.isArray(tag)) {
          option.tag = { "$in": tag };
        } else {
          option.tag = tag;
        }
      }

      let result = await this.Model.listByOptionWithPage(option, page, limit);

      let count = await this.Model.listCount(option);

      ctx.body = yapi.commons.resReturn({
        count: count,
        total: Math.ceil(count / limit),
        list: result
      });
    } catch (err) {
      ctx.body = yapi.commons.resReturn(null, 402, err.message + '1');
    }
  }

  async listByMenu(ctx) {
    let project_id = ctx.params.project_id;
    if (!project_id) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空'));
    }

    let project = await this.projectModel.getBaseInfo(project_id);
    if (!project) {
      return (ctx.body = yapi.commons.resReturn(null, 406, '不存在的项目'));
    }
    if (project.project_type === 'private') {
      if ((await this.checkAuth(project._id, 'project', 'view')) !== true) {
        return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
      }
    }

    try {
      let result = await this.catModel.list(project_id),
        newResult = [];
      for (let i = 0, item, list; i < result.length; i++) {
        item = result[i].toObject();
        list = await this.Model.listByCatid(item._id);
        for (let j = 0; j < list.length; j++) {
          list[j] = list[j].toObject();
        }

        item.list = list;
        newResult[i] = item;
      }
      ctx.body = yapi.commons.resReturn(newResult);
    } catch (err) {
      ctx.body = yapi.commons.resReturn(null, 402, err.message);
    }
  }

  /**
   * 编辑接口
   * @interface /interface/up
   * @method POST
   * @category interface
   * @foldnumber 10
   * @param {Number}   id 接口id，不能为空
   * @param {String}   [path] 接口请求路径
   * @param {String}   [method] 请求方式
   * @param {Array}  [req_headers] 请求的header信息
   * @param {String}  [req_headers[].name] 请求的header信息名
   * @param {String}  [req_headers[].value] 请求的header信息值
   * @param {Boolean}  [req_headers[].required] 是否是必须，默认为否
   * @param {String}  [req_headers[].desc] header描述
   * @param {String}  [req_body_type] 请求参数方式，有["form", "json", "text", "xml"]四种
   * @param {Mixed}  [req_body_form] 请求参数,如果请求方式是form，参数是Array数组，其他格式请求参数是字符串
   * @param {String} [req_body_form[].name] 请求参数名
   * @param {String} [req_body_form[].value] 请求参数值，可填写生成规则（mock）。如@email，随机生成一条email
   * @param {String} [req_body_form[].type] 请求参数类型，有["text", "file"]两种
   * @param {String} [req_body_other]  非form类型的请求参数可保存到此字段
   * @param {String}  [res_body_type] 相应信息的数据格式，有["json", "text", "xml"]三种
   * @param {String} [res_body] 响应信息，可填写任意字符串，如果res_body_type是json,则会调用mock功能
   * @param  {String} [desc] 接口描述
   * @returns {Object}
   * @example ./api/interface/up.json
   */
  async up(ctx) {
    let params = ctx.params;

    if (!_.isUndefined(params.method)) {
      params.method = params.method || 'GET';
      params.method = params.method.toUpperCase();
    }

    let id = params.id;
    params.message = params.message || '';
    params.message = params.message.replace(/\n/g, '<br>');
    // params.res_body_is_json_schema = _.isUndefined (params.res_body_is_json_schema) ? true : params.res_body_is_json_schema;
    // params.req_body_is_json_schema = _.isUndefined(params.req_body_is_json_schema) ?  true : params.req_body_is_json_schema;

    handleHeaders(params)

    let interfaceData = await this.Model.get(id);
    if (!interfaceData) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '不存在的接口'));
    }
    if (!this.$tokenAuth) {
      let auth = await this.checkAuth(interfaceData.project_id, 'project', 'edit');
      if (!auth) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
      }
    }

    let data = Object.assign(
      {
        up_time: yapi.commons.time()
      },
      params
    );

    if (params.path) {
      let http_path;
      http_path = url.parse(params.path, true);

      if (!yapi.commons.verifyPath(http_path.pathname)) {
        return (ctx.body = yapi.commons.resReturn(
          null,
          400,
          'path第一位必需为 /, 只允许由 字母数字-/_:.! 组成'
        ));
      }
      params.query_path = {};
      params.query_path.path = http_path.pathname;
      params.query_path.params = [];
      Object.keys(http_path.query).forEach(item => {
        params.query_path.params.push({
          name: item,
          value: http_path.query[item]
        });
      });
      data.query_path = params.query_path;
    }

    if (
      params.path &&
      (params.path !== interfaceData.path || params.method !== interfaceData.method)
    ) {
      let checkRepeat = await this.Model.checkRepeat(
        interfaceData.project_id,
        params.path,
        params.method
      );
      if (checkRepeat > 0) {
        return (ctx.body = yapi.commons.resReturn(
          null,
          401,
          '已存在的接口:' + params.path + '[' + params.method + ']'
        ));
      }
    }

    if (!_.isUndefined(data.req_params)) {
      if (Array.isArray(data.req_params) && data.req_params.length > 0) {
        data.type = 'var';
      } else {
        data.type = 'static';
        data.req_params = [];
      }
    }
    let result = await this.Model.up(id, data);
    let username = this.getUsername();
    let CurrentInterfaceData = await this.Model.get(id);
    let logData = {
      interface_id: id,
      cat_id: data.catid,
      current: CurrentInterfaceData.toObject(),
      old: interfaceData.toObject()
    };

    this.catModel.get(interfaceData.catid).then(cate => {
      let diffView2 = showDiffMsg(jsondiffpatch, formattersHtml, logData);
      if (diffView2.length <= 0) {
        return; // 没有变化时，不写日志
      }
      yapi.commons.saveLog({
        content: `<a href="/user/profile/${this.getUid()}">${username}</a> 
                    更新了分类 <a href="/project/${cate.project_id}/interface/api/cat_${data.catid
          }">${cate.name}</a> 
                    下的接口 <a href="/project/${cate.project_id}/interface/api/${id}">${interfaceData.title
          }</a><p>${params.message}</p>`,
        type: 'project',
        uid: this.getUid(),
        username: username,
        typeid: cate.project_id,
        data: logData
      });
    });

    this.projectModel.up(interfaceData.project_id, { up_time: new Date().getTime() }).then();
    if (params.switch_notice === true) {
      let diffView = showDiffMsg(jsondiffpatch, formattersHtml, logData);
      let annotatedCss = fs.readFileSync(
        path.resolve(
          yapi.WEBROOT,
          'node_modules/jsondiffpatch/dist/formatters-styles/annotated.css'
        ),
        'utf8'
      );
      let htmlCss = fs.readFileSync(
        path.resolve(yapi.WEBROOT, 'node_modules/jsondiffpatch/dist/formatters-styles/html.css'),
        'utf8'
      );

      let project = await this.projectModel.getBaseInfo(interfaceData.project_id);

      let interfaceUrl = `${ctx.request.origin}/project/${interfaceData.project_id
        }/interface/api/${id}`;

      yapi.commons.sendNotice(interfaceData.project_id, {
        title: `${username} 更新了接口`,
        content: `<html>
        <head>
        <style>
        ${annotatedCss}
        ${htmlCss}
        </style>
        </head>
        <body>
        <div><h3>${username}更新了接口(${data.title})</h3>
        <p>项目名：${project.name} </p>
        <p>修改用户: ${username}</p>
        <p>接口名: <a href="${interfaceUrl}">${data.title}</a></p>
        <p>接口路径: [${data.method}]${data.path}</p>
        <p>详细改动日志: ${this.diffHTML(diffView)}</p></div>
        </body>
        </html>`
      });
    }

    yapi.emitHook('interface_update', id).then();
    await this.autoAddTag(params);

    ctx.body = yapi.commons.resReturn(result);
    return 1;
  }

  diffHTML(html) {
    if (html.length === 0) {
      return `<span style="color: #555">没有改动，该操作未改动Api数据</span>`;
    }

    return html.map(item => {
      return `<div>
      <h4 class="title">${item.title}</h4>
      <div>${item.content}</div>
    </div>`;
    });
  }

  /**
   * 删除接口
   * @interface /interface/del
   * @method GET
   * @category interface
   * @foldnumber 10
   * @param {Number}   id 接口id，不能为空
   * @returns {Object}
   * @example ./api/interface/del.json
   */

  async del(ctx) {
    try {
      let id = ctx.request.body.id;

      if (!id) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '接口id不能为空'));
      }

      let data = await this.Model.get(id);

      if (data.uid != this.getUid()) {
        let auth = await this.checkAuth(data.project_id, 'project', 'danger');
        if (!auth) {
          return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
        }
      }

      // let inter = await this.Model.get(id);
      let result = await this.Model.del(id);
      yapi.emitHook('interface_del', id).then();
      await this.caseModel.delByInterfaceId(id);
      let username = this.getUsername();
      this.catModel.get(data.catid).then(cate => {
        yapi.commons.saveLog({
          content: `<a href="/user/profile/${this.getUid()}">${username}</a> 删除了分类 <a href="/project/${cate.project_id
            }/interface/api/cat_${data.catid}">${cate.name}</a> 下的接口 "${data.title}"`,
          type: 'project',
          uid: this.getUid(),
          username: username,
          typeid: cate.project_id
        });
      });
      this.projectModel.up(data.project_id, { up_time: new Date().getTime() }).then();
      ctx.body = yapi.commons.resReturn(result);
    } catch (err) {
      ctx.body = yapi.commons.resReturn(null, 402, err.message);
    }
  }
  // 处理编辑冲突
  async solveConflict(ctx) {
    try {
      let id = parseInt(ctx.query.id, 10),
        result,
        userInst,
        userinfo,
        data;
      if (!id) {
        return ctx.websocket.send('id 参数有误');
      }
      result = await this.Model.get(id);

      if (result.edit_uid !== 0 && result.edit_uid !== this.getUid()) {
        userInst = yapi.getInst(userModel);
        userinfo = await userInst.findById(result.edit_uid);
        data = {
          errno: result.edit_uid,
          data: { uid: result.edit_uid, username: userinfo.username }
        };
      } else {
        this.Model.upEditUid(id, this.getUid()).then();
        data = {
          errno: 0,
          data: result
        };
      }
      ctx.websocket.send(JSON.stringify(data));
      ctx.websocket.on('close', () => {
        this.Model.upEditUid(id, 0).then();
      });
    } catch (err) {
      yapi.commons.log(err, 'error');
    }
  }

  async addCat(ctx) {
    try {
      let params = ctx.request.body;
      params = yapi.commons.handleParams(params, {
        name: 'string',
        project_id: 'number',
        desc: 'string'
      });

      if (!params.project_id) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空'));
      }
      if (!this.$tokenAuth) {
        let auth = await this.checkAuth(params.project_id, 'project', 'edit');
        if (!auth) {
          return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
        }
      }

      if (!params.name) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '名称不能为空'));
      }

      let result = await this.catModel.save({
        name: params.name,
        project_id: params.project_id,
        desc: params.desc,
        uid: this.getUid(),
        add_time: yapi.commons.time(),
        up_time: yapi.commons.time()
      });

      let username = this.getUsername();
      yapi.commons.saveLog({
        content: `<a href="/user/profile/${this.getUid()}">${username}</a> 添加了分类  <a href="/project/${params.project_id
          }/interface/api/cat_${result._id}">${params.name}</a>`,
        type: 'project',
        uid: this.getUid(),
        username: username,
        typeid: params.project_id
      });

      ctx.body = yapi.commons.resReturn(result);
    } catch (e) {
      ctx.body = yapi.commons.resReturn(null, 402, e.message);
    }
  }

  async upCat(ctx) {
    try {
      let params = ctx.request.body;

      let username = this.getUsername();
      let cate = await this.catModel.get(params.catid);

      let auth = await this.checkAuth(cate.project_id, 'project', 'edit');
      if (!auth) {
        return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
      }

      let result = await this.catModel.up(params.catid, {
        name: params.name,
        desc: params.desc,
        up_time: yapi.commons.time()
      });

      yapi.commons.saveLog({
        content: `<a href="/user/profile/${this.getUid()}">${username}</a> 更新了分类 <a href="/project/${cate.project_id
          }/interface/api/cat_${params.catid}">${cate.name}</a>`,
        type: 'project',
        uid: this.getUid(),
        username: username,
        typeid: cate.project_id
      });

      ctx.body = yapi.commons.resReturn(result);
    } catch (e) {
      ctx.body = yapi.commons.resReturn(null, 400, e.message);
    }
  }

  async delCat(ctx) {
    try {
      let id = ctx.request.body.catid;
      let catData = await this.catModel.get(id);
      if (!catData) {
        ctx.body = yapi.commons.resReturn(null, 400, '不存在的分类');
      }

      if (catData.uid !== this.getUid()) {
        let auth = await this.checkAuth(catData.project_id, 'project', 'danger');
        if (!auth) {
          return (ctx.body = yapi.commons.resReturn(null, 400, '没有权限'));
        }
      }

      let username = this.getUsername();
      yapi.commons.saveLog({
        content: `<a href="/user/profile/${this.getUid()}">${username}</a> 删除了分类 "${catData.name
          }" 及该分类下的接口`,
        type: 'project',
        uid: this.getUid(),
        username: username,
        typeid: catData.project_id
      });

      let interfaceData = await this.Model.listByCatid(id);

      interfaceData.forEach(async item => {
        try {
          yapi.emitHook('interface_del', item._id).then();
          await this.caseModel.delByInterfaceId(item._id);
        } catch (e) {
          yapi.commons.log(e.message, 'error');
        }
      });
      await this.catModel.del(id);
      let r = await this.Model.delByCatid(id);
      return (ctx.body = yapi.commons.resReturn(r));
    } catch (e) {
      yapi.commons.resReturn(null, 400, e.message);
    }
  }

  /**
   * 获取分类列表
   * @interface /interface/getCatMenu
   * @method GET
   * @category interface
   * @foldnumber 10
   * @param {Number}   project_id 项目id，不能为空
   * @returns {Object}
   * @example ./api/interface/getCatMenu
   */
  async getCatMenu(ctx) {
    let project_id = ctx.params.project_id;

    if (!project_id || isNaN(project_id)) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空'));
    }

    try {
      let project = await this.projectModel.getBaseInfo(project_id);
      if (project.project_type === 'private') {
        if ((await this.checkAuth(project._id, 'project', 'edit')) !== true) {
          return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
        }
      }
      let res = await this.catModel.list(project_id);
      return (ctx.body = yapi.commons.resReturn(res));
    } catch (e) {
      yapi.commons.resReturn(null, 400, e.message);
    }
  }

  /**
   * 获取自定义接口字段数据
   * @interface /interface/get_custom_field
   * @method GET
   * @category interface
   * @foldnumber 10
   * @param {String}   app_code = '111'
   * @returns {Object}
   *
   */
  async getCustomField(ctx) {
    let params = ctx.request.query;

    if (Object.keys(params).length !== 1) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '参数数量错误'));
    }
    let customFieldName = Object.keys(params)[0];
    let customFieldValue = params[customFieldName];

    try {
      //  查找有customFieldName的分组（group）
      let groups = await this.groupModel.getcustomFieldName(customFieldName);
      if (groups.length === 0) {
        return (ctx.body = yapi.commons.resReturn(null, 404, '没有找到对应自定义接口'));
      }

      // 在每个分组（group）下查找对应project的id值
      let interfaces = [];
      for (let i = 0; i < groups.length; i++) {
        let projects = await this.projectModel.list(groups[i]._id);

        // 在每个项目（project）中查找interface下的custom_field_value
        for (let j = 0; j < projects.length; j++) {
          let data = {};
          let inter = await this.Model.getcustomFieldValue(projects[j]._id, customFieldValue);
          if (inter.length > 0) {
            data.project_name = projects[j].name;
            data.project_id = projects[j]._id;
            inter = inter.map((item, i) => {
              item = inter[i] = inter[i].toObject();
              item.res_body = yapi.commons.json_parse(item.res_body);
              item.req_body_other = yapi.commons.json_parse(item.req_body_other);

              return item;
            });

            data.list = inter;
            interfaces.push(data);
          }
        }
      }
      return (ctx.body = yapi.commons.resReturn(interfaces));
    } catch (e) {
      yapi.commons.resReturn(null, 400, e.message);
    }
  }

  requiredSort(params) {
    return params.sort((item1, item2) => {
      return item2.required - item1.required;
    });
  }

  /**
   * 更新多个接口case index
   * @interface /interface/up_index
   * @method POST
   * @category col
   * @foldnumber 10
   * @param {Array}  [id, index]
   * @returns {Object}
   * @example
   */
  async upIndex(ctx) {
    try {
      let params = ctx.request.body;
      if (!params || !Array.isArray(params)) {
        ctx.body = yapi.commons.resReturn(null, 400, '请求参数必须是数组');
      }
      params.forEach(item => {
        if (item.id) {
          this.Model.upIndex(item.id, item.index).then(
            res => { },
            err => {
              yapi.commons.log(err.message, 'error');
            }
          );
        }
      });

      return (ctx.body = yapi.commons.resReturn('成功！'));
    } catch (e) {
      ctx.body = yapi.commons.resReturn(null, 400, e.message);
    }
  }

  /**
   * 更新多个接口cat index
   * @interface /interface/up_cat_index
   * @method POST
   * @category col
   * @foldnumber 10
   * @param {Array}  [id, index]
   * @returns {Object}
   * @example
   */
  async upCatIndex(ctx) {
    try {
      let params = ctx.request.body;
      if (!params || !Array.isArray(params)) {
        ctx.body = yapi.commons.resReturn(null, 400, '请求参数必须是数组');
      }
      params.forEach(item => {
        if (item.id) {
          this.catModel.upCatIndex(item.id, item.index).then(
            res => { },
            err => {
              yapi.commons.log(err.message, 'error');
            }
          );
        }
      });

      return (ctx.body = yapi.commons.resReturn('成功！'));
    } catch (e) {
      ctx.body = yapi.commons.resReturn(null, 400, e.message);
    }
  }

  async schema2json(ctx) {
    let schema = ctx.request.body.schema;
    let required = ctx.request.body.required;

    let res = yapi.commons.schemaToJson(schema, {
      alwaysFakeOptionals: _.isUndefined(required) ? true : required
    });
    // console.log('res',res)
    return (ctx.body = res);
  }

  // 获取开放接口数据
  async listByOpen(ctx) {
    let project_id = ctx.request.query.project_id;

    if (!project_id) {
      return (ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空'));
    }

    let project = await this.projectModel.getBaseInfo(project_id);
    if (!project) {
      return (ctx.body = yapi.commons.resReturn(null, 406, '不存在的项目'));
    }
    if (project.project_type === 'private') {
      if ((await this.checkAuth(project._id, 'project', 'view')) !== true) {
        return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
      }
    }

    let basepath = project.basepath;
    try {
      let result = await this.catModel.list(project_id),
        newResult = [];

      for (let i = 0, item, list; i < result.length; i++) {
        item = result[i].toObject();
        list = await this.Model.listByInterStatus(item._id, 'open');
        for (let j = 0; j < list.length; j++) {
          list[j] = list[j].toObject();
          list[j].basepath = basepath;
        }

        newResult = [].concat(newResult, list);
      }

      ctx.body = yapi.commons.resReturn(newResult);
    } catch (err) {
      ctx.body = yapi.commons.resReturn(null, 402, err.message);
    }
  }

  // 上传协议
  async pushProto(ctx) {
    try {
      let pid = ctx.params.project.toString();
      let root = path.resolve("./proto");
      if (!pathExistsSync(root)) mkdirSync(root);
      root = path.join(root, pid);
      if (!pathExistsSync(root)) mkdirSync(root);
      root = path.join(root, ctx.params.name);
      fs.writeFileSync(root, ctx.params.file);
      await this.listProto(ctx);
      this.protoIDMap[pid] = null;
      this.protoPBMap[pid] = null;
      yapi.commons.saveLog({
        content: `<a>${this.$user.username}</a> 上传了协议：${ctx.params.name}`,
        type: 'project',
        uid: this.$uid,
        username: this.$user.username,
        typeid: pid
      });
    } catch (err) {
      ctx.body = yapi.commons.resReturn(null, 402, err.message);
    }
  }

  // 列举协议
  async listProto(ctx) {
    try {
      let pid = ctx.params.project.toString();
      let root = path.join(path.resolve("./proto"), pid);
      let files = new Array();
      rd.eachFileFilterSync(root, /(\.h)|(\.proto)$/, f => {
        files.push({ name: path.relative(root, f), mtime: fs.statSync(f).mtimeMs });
      })
      ctx.body = yapi.commons.resReturn(files);
    } catch (err) {
      ctx.body = yapi.commons.resReturn(null, 402, err.message);
    }
  }

  // 删除协议
  async delProto(ctx) {
    try {
      let pid = ctx.params.project.toString();
      let root = path.join(path.resolve("./proto"), pid);
      let names = ctx.params.names;
      let log = "";
      for (let i = 0; i < names.length; i++) {
        let f = path.join(root, names[i]);
        fs.unlinkSync(f);
        if (log != "") log += ", ";
        log += names[i];
      }
      await this.listProto(ctx);
      yapi.commons.saveLog({
        content: `<a>${this.$user.username}</a> 删除了协议：${log}`,
        type: 'project',
        uid: this.$uid,
        username: this.$user.username,
        typeid: pid
      });
    } catch (err) {
      ctx.body = yapi.commons.resReturn(null, 402, err.message);
    }
  }

  // 下载协议
  async pullProto(ctx) {
    try {
      let pid = ctx.params.project.toString();
      let root = path.join(path.resolve("./proto"), pid);
      let names = ctx.params.names;
      if (names == null || names.length == 0) {
        throw new Error("zero names.length");
      } else if (names.length == 1) {
        let file = path.join(root, names[0]);
        file = fs.readFileSync(file);
        ctx.body = yapi.commons.resReturn({ name: names[0], file: file });
      } else {
        let tmp = path.join(root, "..", "tmp_" + Date.now());
        let zip = tmp + ".zip";
        mkdirsSync(tmp);
        for (let i = 0; i < names.length; i++) {
          let f = path.join(root, names[i]);
          let t = path.join(tmp, names[i]);
          let d = path.dirname(t);
          if (!fs.existsSync(d)) mkdirsSync(d);
          fs.writeFileSync(t, fs.readFileSync(f));
        }
        try {
          await nzip.zip(tmp, zip);
          let file = fs.readFileSync(zip);
          ctx.body = yapi.commons.resReturn({ name: "proto-" + path.basename(root) + ".zip", file: file });
        } catch (err) {
          throw err
        } finally {
          fs.unlinkSync(zip);
          fs.rmdirSync(tmp, { recursive: true, force: true });
        }
      }
    } catch (err) {
      ctx.body = yapi.commons.resReturn(null, 402, err.message);
    }
  }

  // 更新协议
  async updateProto(ctx) {
    try {
      let pid = ctx.params.project;
      let proj = await this.projectModel.get(pid);
      if (proj == null) throw new Error("no project was found, pid: " + pid);
      await this.fetchProto(proj);
      await this.listProto(ctx);
      let purl = `${proj.proto_repo.replace(".git", "")}/tree/${proj.proto_branch}`;
      if (proj.repo_type == "gitea") purl = `${proj.proto_repo.replace(".git", "")}/src/branch/${proj.proto_branch}`;
      yapi.commons.saveLog({
        content: `<a>${this.$user.username}</a> 更新了协议<a href="${purl}" target="_blank">[branch: ${proj.proto_branch}]</a>`,
        type: 'project',
        uid: this.$uid,
        username: this.$user.username,
        typeid: pid
      });
    } catch (err) {
      ctx.body = yapi.commons.resReturn(null, 402, err.message);
    }
  }

  // 同步协议
  async syncProto(ctx) {
    try {
      let ret = "";
      let repo = null;
      let branch = null;
      let repoUser = null;
      let commitMsg = null;
      let commitUrl = null;
      if (ctx.params.object_kind) { // 腾讯工蜂: https://code.tencent.com/help/webhooks#webHooksPush
        repo = ctx.params.repository.git_http_url;
        branch = ctx.params.ref;
        let commit = ctx.params.commits[0];
        repoUser = ctx.params.user_name;
        commitMsg = commit ? commit.message : "";
        commitUrl = commit ? commit.url : "";
      } else if (ctx.request.header["x-gitea-event"] || ctx.request.header["X-Gitea-Event"]) { // Gitea：https://docs.gitea.com/zh-cn/usage/webhooks
        repo = ctx.params.repository.clone_url;
        branch = ctx.params.ref;
        let commit = ctx.params.commits[0];
        repoUser = commit ? commit.author.name : "NONE";
        commitMsg = commit ? commit.message : "";
        commitUrl = commit ? commit.url : "";
      } else {
        throw new Error("unsupported hook params.")
      }
      if (branch == null || branch == "") throw new Error("branch is null.")
      if (repo == null || repo == "") throw new Error("repo is null.")
      let projs = await this.projectModel.list();
      for (let i = 0; i < projs.length; i++) {
        let proj = projs[i]
        if (proj.proto_repo == repo && branch.endsWith(proj.proto_branch)) {
          if (ret != "") ret + ", ";
          ret += proj.id;
          let pid = proj.id.toString();
          proj = await this.projectModel.get(proj.id); // 确保repo_token
          await this.fetchProto(proj);
          let purl = `${proj.proto_repo.replace(".git", "")}/tree/${proj.proto_branch}`;
          if (proj.repo_type == "gitea") purl = `${proj.proto_repo.replace(".git", "")}/src/branch/${proj.proto_branch}`;
          yapi.commons.saveLog({
            content: `<a>${repoUser}</a> 同步了协议<a href="${purl}" target="_blank">[branch: ${proj.proto_branch}]</a> <a href="${commitUrl}" target="_blank">${commitMsg.trim()}</a>`,
            type: 'project',
            uid: this.$uid,
            username: this.$user.username,
            typeid: pid
          });
        }
      }
      ctx.body = yapi.commons.resReturn(`sync proto of project: [${ret}] success.`);
    } catch (err) {
      ctx.body = yapi.commons.resReturn(null, 43010, err.message);
    }
  }

  async fetchProto(proj) {
    let pid = proj._id.toString();
    let root = path.resolve("./proto");
    if (!pathExistsSync(root)) mkdirSync(root);
    root = path.join(root, pid);
    if (!pathExistsSync(root)) mkdirSync(root);
    const { repo_type, proto_repo, proto_branch, repo_token } = proj;
    if (proto_repo == null || proto_repo == "") throw new Error("proto_repo is invalid, pid: " + pid);
    if (proto_branch == null || proto_branch == "") throw new Error("proto_branch is invalid, pid: " + pid);
    if (repo_token == null || repo_token == "") throw new Error("repo_token is invalid, pid: " + pid);

    if (repo_type == "gitea") {
      let strs = proto_repo.split("/")
      let domain = strs[0] + "//" + strs[2]
      let ns = strs[3]
      let name = strs[4].replace(".git", "")
      let aurl = domain + "/api/v1/repos/" + ns + "/" + name + "/archive/" + proto_branch + ".zip" + "?access_token=" + aesDecode(repo_token);
      await new Promise((resolve, reject) => {
        let service = aurl.startsWith("https") ? https : http;
        service.get(aurl, (resp) => {
          let datas = new Array();
          resp.on("data", (data) => { datas.push(data) });
          resp.on("error", err => reject(err));
          resp.on("end", async () => {
            let tmpRoot = path.join(root, "..", "tmp_" + Date.now());
            let tmpZip = tmpRoot + ".zip";
            try {
              fs.writeFileSync(tmpZip, Buffer.concat(datas));
              await nzip.unzip(tmpZip, tmpRoot);
              let tmpProto = path.join(tmpRoot, name.toLowerCase());
              fs.rmdirSync(root, { recursive: true, force: true });
              fs.mkdirSync(root);
              rd.eachFileSync(tmpProto, (f) => {
                let n = path.basename(f);
                let t = path.dirname(f);
                let r = path.relative(tmpProto, t);
                let s = r.split(path.sep);
                let d = root;
                for (let i = 0; i < s.length; i++) {
                  d += path.sep + s[i];
                  if (!fs.existsSync(d)) fs.mkdirSync(d);
                  else break;
                }
                fs.writeFileSync(path.join(d, n), fs.readFileSync(f));
              });
              // fs.moveSync(tmpProto, root, { overwrite: true }); // [tofix 20240423]windows docker permission issue.
              resolve();
            } catch (err) { reject(new Error(`unzip ${proto_repo}#${proto_branch}(${repo_type}) error: ${err.message}`)) }
            finally {
              fs.unlinkSync(tmpZip);
              fs.rmdirSync(tmpRoot, { recursive: true, force: true });
            }
          });
        });
      });
      this.protoIDMap[pid] = null;
      this.protoPBMap[pid] = null;
    } else if (repo_type == "gitcode") {
      let ns = proto_repo.replace("https://git.code.tencent.com/", "").replace(".git", "").replace(/\//gm, "%2F");
      let aurl = "https://git.code.tencent.com/api/v3/projects/" + ns +
        "/repository/archive?sha=" + proto_branch +
        "&private_token=" + aesDecode(repo_token);
      await new Promise((resolve, reject) => {
        https.get(aurl, (resp) => {
          let datas = new Array();
          resp.on("data", (data) => { datas.push(data) });
          resp.on("error", err => reject(err));
          resp.on("end", async () => {
            let tmp = path.join(root, "..", "tmp_" + Date.now() + ".zip");
            try {
              fs.writeFileSync(tmp, Buffer.concat(datas));
              fs.rmdirSync(root, { recursive: true, force: true });
              await nzip.unzip(tmp, root);
              resolve();
            } catch (err) { reject(new Error(`unzip ${proto_repo}#${proto_branch}(${repo_type}) error: ${err.message}`)) }
            finally { fs.unlinkSync(tmp); }
          });
        });
      });
      this.protoIDMap[pid] = null;
      this.protoPBMap[pid] = null;
    } else {
      throw new Error(`proto_repo ${proto_repo} of type ${repo_type} wasn't supported by now`);
    }
  }

  // 获取ID
  getID(pid, str, full) {
    let rets = [];
    try {
      pid = pid.toString();
      str = str.toLowerCase();
      let root = path.join(path.resolve("./proto"), pid);
      let protoIDs = this.protoIDMap[pid];
      if (protoIDs == null) {
        protoIDs = {};
        this.protoIDMap[pid] = protoIDs;
        rd.eachFileFilterSync(root, /\.h$/, f => {
          let ctt = fs.readFileSync(f, "utf-8");
          let lines = ctt.split("\n");
          let enumObj = null;
          for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (line.startsWith("enum")) {
              let enumName = line.replace("enum", "").replace(/ /gm, "").replace(/{/gm, "");
              enumObj = {};
              protoIDs[enumName] = enumObj;
              continue;
            }
            if (line.startsWith("/") || line == ""
              || line.startsWith("{") || line.startsWith("}")
              || line.replace(" ", "").startsWith("*") || line.replace(" ", "").startsWith("/")
              || enumObj == null) {
              continue;
            }
            let fieldComment = "";
            let fieldName = line.replace("\t", "").replace(" ", "");
            if (fieldName == "") continue;
            let index1 = fieldName.indexOf("/");
            if (index1 == 0) continue;
            if (index1 > 0) {
              fieldComment = fieldName.substring(index1, fieldName.length);
              fieldName = fieldName.substring(0, index1);
            }
            fieldName = fieldName.replace("/", "");

            let index2 = fieldName.indexOf("=");
            if (index2 > 0) {
              try {
                fieldName = fieldName.substring(0, index2);
              } catch {
                continue // ref enum value.  
              }
            }
            fieldName = fieldName.replace(",", "").trim();
            if (fieldComment != "") fieldComment = fieldComment.replace("//", "").trim();
            enumObj[fieldName] = fieldComment;
          }
        })
      }
      for (let k1 in protoIDs) {
        let enumObj = protoIDs[k1]
        for (let k2 in enumObj) {
          let v = enumObj[k2];
          let d = k1 + "." + k2
          let t = d.toLocaleLowerCase();
          if (full ? t == str : (t.indexOf(str) >= 0 || str == "")) {
            full ? rets.push({ name: d, comment: v }) : rets.push(d);
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
    return rets;
  }

  // 获取PB
  getPB(pid, str, full) {
    let rets = [];
    try {
      pid = pid.toString();
      str = str.toLowerCase();
      let root = path.join(path.resolve("./proto"), pid);
      let protoPBs = this.protoPBMap[pid];
      if (protoPBs == null) {
        protoPBs = {};
        this.protoPBMap[pid] = protoPBs;
        rd.eachFileFilterSync(root, /\.proto$/, f => {
          let ctt = fs.readFileSync(f, "utf-8");
          let lines = ctt.split("\n");
          let mname = "";
          let nctt = "";
          for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            let tline = line.trim();
            if (tline.startsWith("package ") || tline.startsWith("synatx ") || tline == "") {
              continue;
            } else if (tline.startsWith("message ")) {
              mname = tline.split("/")[0].replace("message ", "").replace(/ /g, "").replace(/\t/g, "").replace("{", "").trim();
              nctt += tline + "\n";
            } else if (tline.startsWith("}")) {
              nctt += line + "\n";
              protoPBs[mname] = `// source: ${path.relative(root, f)}\n${nctt.trim()}`;
              nctt = "";
            } else {
              nctt += line + "\n";
            }
          }
        });
      }

      function wrap(ctt, visited) {
        let nctt = "";
        let lines = ctt.split("\n");
        for (let i = 0; i < lines.length; i++) {
          let line = lines[i].trim();
          if (line.startsWith("required") ||
            line.startsWith("optional") ||
            line.startsWith("repeated")) {
            line = line.replace(/\t/g, " ").replace(/  /g, " ").replace(/   /g, " ").replace(/    /g, " ").replace(/     /g, " ").replace(/      /g, " ");
            let ss = line.split("=");
            let s0 = ss[0].trim();
            let aa = s0.split(" ");
            let type = aa[1];
            if (protoPBs[type] && !visited[type]) {
              visited[type] = true;
              nctt += "\n\n";
              nctt += wrap(protoPBs[type], visited);
            }
          }
        }
        return ctt + nctt;
      }

      for (let k in protoPBs) {
        let v = protoPBs[k];
        let t = k.toLocaleLowerCase();
        if (full ? t == str : (t.indexOf(str) >= 0 || str == "")) {
          let visited = {};
          visited[k] = true;
          full ? rets.push({ name: k, struct: wrap(v, visited) }) : rets.push(k);
        }
      }
    } catch (err) {
      console.error(err);
    }
    return rets;
  }

  // 筛选ID
  async filterID(ctx) {
    ctx.body = yapi.commons.resReturn(this.getID(ctx.params.project, ctx.params.str, ctx.params.full));
  }

  // 筛选PB
  async filterPB(ctx) {
    ctx.body = yapi.commons.resReturn(this.getPB(ctx.params.project, ctx.params.str, ctx.params.full));
  }
}

module.exports = interfaceController;
