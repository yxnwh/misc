/*
update 2021/4/11

京东价格保护：脚本更新地址 https://raw.githubusercontent.com/ZCY01/daily_scripts/main/jd/jd_priceProtect.js
脚本兼容: QuantumultX, Node.js

==========================Quantumultx=========================
[task_local]
# 京东价格保护
5 0 * * * https://raw.githubusercontent.com/yxnwh/misc/main/jd/jd_priceProtect.js, tag=京东价格保护, img-url=https://raw.githubusercontent.com/ZCY01/img/master/pricev1.png, enabled=true
*/
const $ = new Env('京东价格保护');

const selfDomain = 'https://msitepp-fm.jd.com/';
const unifiedGatewayName = 'https://api.m.jd.com/';

!(async () => {
	await requireConfig()
	if (!$.cookiesArr[0]) {
		$.msg($.name, '【提示】请先获取京东账号一cookie\n直接使用NobyDa的京东签到获取', 'https://bean.m.jd.com/', {
			"open-url": "https://bean.m.jd.com/"
		})
		return
	}
	for (let i = 0; i < $.cookiesArr.length; i++) {
		if ($.cookiesArr[i]) {
			$.cookie = $.cookiesArr[i]
			$.UserName = decodeURIComponent($.cookie.match(/pt_pin=(.+?);/) && $.cookie.match(/pt_pin=(.+?);/)[1])
			$.index = i + 1
			$.isLogin = true
			$.nickName = ''
			await totalBean();
			if (!$.isLogin) {
				$.msg($.name, `【提示】cookie已失效`, `京东账号${$.index} ${$.nickName || $.UserName}\n请重新登录获取\nhttps://bean.m.jd.com/`, {
					"open-url": "https://bean.m.jd.com/"
				})
				await $.notify.sendNotify(`${$.name}cookie已失效 - ${$.UserName}`, `京东账号${$.index} ${$.UserName}\n请重新登录获取cookie`);
				continue
			}
			console.log(`\n***********开始【京东账号${$.index}】${$.nickName || $.UserName}********\n`);

			$.hasNext = true
			$.refundtotalamount = 0
			$.orderList = new Array()
			$.applyMap = {}

			// TODO
			$.token = ''
			$.feSt = 'f'

			console.log(`💥 获得首页面，解析超参数`)
			await getHyperParams()
			console.log($.HyperParam)

			console.log(`🧾 获取所有价格保护列表，排除附件商品`)
			for (let page = 1; $.hasNext; page++) {
				await getApplyData(page)
			}

			console.log(`🗑 删除不符合订单`)
			let taskList = []
			for (let order of $.orderList) {
				taskList.push(HistoryResultQuery(order))
			}
			await Promise.all(taskList)

			console.log(`📊 ${$.orderList.length}个商品即将申请价格保护！`)
			for (let order of $.orderList) {
				await skuApply(order)
				await $.wait(200)
			}

			for (let i = 1; i <= 30 && Object.keys($.applyMap).length > 0; i++) {
				console.log(`⏳ 获取申请价格保护结果，${30-i}s...`)
				await $.wait(1000)
				if (i % 5 == 0) {
					await getApplyResult()
				}
			}

			await showMsg()
		}
	}
})()
.catch((e) => {
	console.log(`❗️ ${$.name} 运行错误！\n${e}`)
}).finally(() => $.done())

function requireConfig() {
	return new Promise(resolve => {
		console.log('开始获取配置文件\n')
		$.notify = $.isNode() ? require('./sendNotify') : {sendNotify:async () => {}}
		//获取 Cookies
		$.cookiesArr = []
		if ($.isNode()) {
			//Node.js用户请在jdCookie.js处填写京东ck;
			const jdCookieNode = require('./jdCookie.js');
			Object.keys(jdCookieNode).forEach((item) => {
				if (jdCookieNode[item]) {
					$.cookiesArr.push(jdCookieNode[item])
				}
			})
			if (process.env.JD_DEBUG && process.env.JD_DEBUG === 'false') console.log = () => {};
		} else {
			//IOS等用户直接用NobyDa的jd $.cookie
			$.cookiesArr = [$.getdata('CookieJD'), $.getdata('CookieJD2'), ...jsonParse($.getdata('CookiesJD') || "[]").map(item => item.cookie)].filter(item => !!item);
		}
		console.log(`共${$.cookiesArr.length}个京东账号\n`)
		resolve()
	})
}

const getValueById = function (text, id) {
	try {
		const reg = new RegExp(`id="${id}".*value="(.*?)"`)
		const res = text.match(reg)
		return res[1]
	} catch (e) {
		throw new Error(`getValueById:${id} err`)
	}
}

function getHyperParams() {
	return new Promise((resolve, reject) => {
		const options = {
			"url": 'https://msitepp-fm.jd.com/rest/priceprophone/priceProPhoneMenu',
			"headers": {
				'Host': 'msitepp-fm.jd.com',
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'Connection': 'keep-alive',
				'Cookie': $.cookie,
				'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
				'Accept-Language': 'zh-cn',
				'Referer': 'https://ihelp.jd.com/',
				'Accept-Encoding': 'gzip, deflate, br',
			},
		}
		$.get(options, (err, resp, data) => {
			try {
				if (err) throw new Error(JSON.stringify(err))
				$.HyperParam = {
					sid_hid: getValueById(data, 'sid_hid'),
					type_hid: getValueById(data, 'type_hid'),
					isLoadLastPropriceRecord: getValueById(data, 'isLoadLastPropriceRecord'),
					isLoadSkuPrice: getValueById(data, 'isLoadSkuPrice'),
					RefundType_Orderid_Repeater_hid: getValueById(data, 'RefundType_Orderid_Repeater_hid'),
					isAlertSuccessTip: getValueById(data, 'isAlertSuccessTip'),
					forcebot: getValueById(data, 'forcebot'),
					useColorApi: getValueById(data, 'useColorApi'),
				}
			} catch (e) {
				reject(`⚠️ ${arguments.callee.name.toString()} API返回结果解析出错\n${e}\n${JSON.stringify(data)}`)
			} finally {
				resolve();
			}
		})
	})
}

function getApplyData(page) {
	return new Promise((resolve, reject) => {

		$.hasNext = false
		const pageSize = 5
		let paramObj = {};
		paramObj.page = page
		paramObj.pageSize = pageSize
		paramObj.keyWords = ""
		paramObj.sid = $.HyperParam.sid_hid
		paramObj.type = $.HyperParam.type_hid
		paramObj.forcebot = $.HyperParam.forcebot
		paramObj.token = $.token
		paramObj.feSt = $.feSt

		$.post(taskurl('siteppM_priceskusPull', paramObj), (err, resp, data) => {
			try {
				if (err) {
					console.log(`🚫 ${arguments.callee.name.toString()} API请求失败，请检查网路\n${JSON.stringify(err)}`)
				} else {
					let pageErrorVal = data.match(/id="pageError_\d+" name="pageError_\d+" value="(.*?)"/)[1]
					if (pageErrorVal == 'noexception') {
						let pageDatasSize = eval(data.match(/id="pageSize_\d+" name="pageSize_\d+" value="(.*?)"/)[1])
						$.hasNext = pageDatasSize >= pageSize

						let orders = [...data.matchAll(/skuApply\((.*?)\)/g)]
						let titles = [...data.matchAll(/<p class="name">(.*?)<\/p>/g)]
						for (let i = 0; i < orders.length; i++) {
							let info = orders[i][1].split(',')
							if (info.length != 4) {
								throw new Error(`价格保护 ${order[1]}.length != 4`)
							}

							const item = {
								orderId: eval(info[0]),
								skuId: eval(info[1]),
								sequence: eval(info[2]),
								orderCategory: eval(info[3]),

								title: `🛒${titles[i][1].substr(0,15)}🛒`,
							}

							let id = `skuprice_${item.orderId}_${item.skuId}_${item.sequence}`
							let reg = new RegExp(`${id}.*?isfujian="(.*?)"`)
							isfujian = data.match(reg)[1]

							if (isfujian == "false") {
								let skuRefundTypeDiv_orderId = `skuRefundTypeDiv_${item.orderId}`
								item['refundtype'] = getValueById(data, skuRefundTypeDiv_orderId)
								$.orderList.push(item)
							}
							//else...尊敬的顾客您好，您选择的商品本身为赠品，是不支持价保的呦，请您理解。
						}
					}
				}
			} catch (e) {
				reject(`⚠️ ${arguments.callee.name.toString()} API返回结果解析出错\n${e}\n${JSON.stringify(data)}`)
			} finally {
				resolve();
			}
		})
	})
}

//  申请按钮
// function skuApply(orderId, skuId, sequence, orderCategory, refundtype) {
function skuApply(order) {
	return new Promise((resolve, reject) => {
		let paramObj = {};
		paramObj.orderId = order.orderId;
		paramObj.orderCategory = order.orderCategory;
		paramObj.skuId = order.skuId;
		paramObj.sid = $.HyperParam.sid_hid
		paramObj.type = $.HyperParam.type_hid
		paramObj.refundtype = order.refundtype
		paramObj.forcebot = $.HyperParam.forcebot
		paramObj.token = $.token
		paramObj.feSt = $.feSt

		console.log(`🈸 ${order.title} 正在价格保护...`)
		$.post(taskurl('siteppM_proApply', paramObj), (err, resp, data) => {
			try {
				if (err) {
					console.log(`🚫 ${arguments.callee.name.toString()} API请求失败，请检查网路\n${JSON.stringify(err)}`)
				} else {
					data = JSON.parse(data)
					if (data.flag) {
						if (data.proSkuApplyId != null) {
							$.applyMap[data.proSkuApplyId[0]] = order
						}
					} else {
						console.log(`🚫 ${order.title} 申请失败：${data.errorMessage}`)
					}
				}
			} catch (e) {
				reject(`⚠️ ${arguments.callee.name.toString()} API返回结果解析出错\n${e}\n${JSON.stringify(data)}`)
			} finally {
				resolve();
			}
		})
	})
}

function HistoryResultQuery(order) {
	return new Promise((resolve, reject) => {
		let paramObj = {};
		paramObj.orderId = order.orderId;
		paramObj.skuId = order.skuId;
		paramObj.sequence = order.sequence;
		paramObj.sid = $.HyperParam.sid_hid
		paramObj.type = $.HyperParam.type_hid
		paramObj.pin = undefined
		paramObj.forcebot = $.HyperParam.forcebot

		const reg = new RegExp("overTime|[^库]不支持价保|无法申请价保|请用原订单申请")
		let deleted = true
		$.post(taskurl('siteppM_skuProResultPin', paramObj), (err, resp, data) => {
			try {
				if (err) {
					console.log(`🚫 ${arguments.callee.name.toString()} API请求失败，请检查网路\n${JSON.stringify(err)}`)
				} else {
					deleted = reg.test(data)
				}
			} catch (e) {
				reject(`⚠️ ${arguments.callee.name.toString()} API返回结果解析出错\n${e}\n${JSON.stringify(data)}`)
			} finally {
				if (deleted) {
					console.log(`⏰ 删除商品：${order.title}`)
					$.orderList = $.orderList.filter(item => {
						return item.orderId != order.orderId || item.skuId != order.skuId
					})
				}
				resolve()
			}
		})
	})
}

function getApplyResult() {
	function handleApplyResult(ajaxResultObj) {
		if (ajaxResultObj.hasResult != "undefined" && ajaxResultObj.hasResult == true) { //有结果了
			let proSkuApplyId = ajaxResultObj.applyResultVo.proSkuApplyId; //申请id
			let order = $.applyMap[proSkuApplyId]
			delete $.applyMap[proSkuApplyId]
			if (ajaxResultObj.applyResultVo.proApplyStatus == 'ApplySuccess') { //价保成功
				$.refundtotalamount += ajaxResultObj.applyResultVo.refundtotalamount
				console.log(`📋 ${order.title} \n🟢 申请成功：￥${$.refundtotalamount}`);
			} else {
				console.log(`📋 ${order.title} \n🔴 申请失败：${ajaxResultObj.applyResultVo.failTypeStr} \n🔴 失败类型:${ajaxResultObj.applyResultVo.failType}`);
			}
		}
	}
	return new Promise((resolve, reject) => {
		let proSkuApplyIds = Object.keys($.applyMap).join(",");
		let paramObj = {};
		paramObj.proSkuApplyIds = proSkuApplyIds;
		paramObj.pin = $.HyperParam.pin
		paramObj.type = $.HyperParam.type_hid

		$.post(taskurl('siteppM_moreApplyResult', paramObj), (err, resp, data) => {
			try {
				if (err) {
					console.log(`🚫 ${arguments.callee.name.toString()} API请求失败，请检查网路\n${JSON.stringify(err)}`)
				} else if (data) {
					data = JSON.parse(data)
					let resultArray = data.applyResults;
					for (let i = 0; i < resultArray.length; i++) {
						let ajaxResultObj = resultArray[i];
						handleApplyResult(ajaxResultObj);
					}
				}
			} catch (e) {
				reject(`⚠️ ${arguments.callee.name.toString()} API返回结果解析出错\n${e}\n${JSON.stringify(data)}`)
			} finally {
				resolve()
			}
		})
	})
}

function taskurl(functionid, body) {
	let urlStr = selfDomain + "rest/priceprophone/priceskusPull"
	if ($.HyperParam.useColorApi == "true") {
		urlStr = unifiedGatewayName + "api?appid=siteppM&functionId=" + functionid + "&forcebot=" + $.HyperParam.forcebot + "&t=" + new Date().getTime()
	}
	return {
		"url": urlStr,
		"headers": {
			'Host': $.HyperParam.useColorApi == 'true' ? 'api.m.jd.com' : 'msitepp-fm.jd.com',
			'Accept': '*/*',
			'Accept-Language': 'zh-cn',
			'Accept-Encoding': 'gzip, deflate, br',
			'Content-Type': 'application/x-www-form-urlencoded',
			'Origin': 'https://msitepp-fm.jd.com',
			'Connection': 'keep-alive',
			'Referer': 'https://msitepp-fm.jd.com/rest/priceprophone/priceProPhoneMenu',
			"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
			"Cookie": $.cookie
		},
		"body": body ? `body=${JSON.stringify(body)}` : undefined
	}
}

async function showMsg() {
	const message = `京东账号${$.index} ${$.nickName || $.UserName}\n🎉 本次价格保护金额：${$.refundtotalamount}💰`
	console.log(message)
	if ($.refundtotalamount) {
		$.msg($.name, ``, message, {
			"open-url": "https://msitepp-fm.jd.com/rest/priceprophone/priceProPhoneMenu"
		});
		await $.notify.sendNotify($.name, message)
	}
}

function totalBean() {
	return new Promise(async resolve => {
		const options = {
			"url": `https://wq.jd.com/user/info/QueryJDUserInfo?sceneval=2`,
			"headers": {
				"Accept": "application/json,text/plain, */*",
				"Content-Type": "application/x-www-form-urlencoded",
				"Accept-Encoding": "gzip, deflate, br",
				"Accept-Language": "zh-cn",
				"Connection": "keep-alive",
				"Cookie": $.cookie,
				"Referer": "https://wqs.jd.com/my/jingdou/my.shtml?sceneval=2",
				"User-Agent": $.isNode() ? (process.env.JD_USER_AGENT ? process.env.JD_USER_AGENT : (require('./USER_AGENTS').USER_AGENT)) : ($.getdata('JDUA') ? $.getdata('JDUA') : "jdapp;iPhone;9.4.4;14.3;network/4g;Mozilla/5.0 (iPhone; CPU iPhone OS 14_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148;supportJDSHWK/1")
			},
			"timeout": 10000,
		}
		$.post(options, (err, resp, data) => {
			try {
				if (err) {
					console.log(`${JSON.stringify(err)}`)
					console.log(`${$.name} API请求失败，请检查网路重试`)
				} else {
					if (data) {
						data = JSON.parse(data);
						if (data['retcode'] === 13) {
							$.isLogin = false; //cookie过期
							return
						}
						if (data['retcode'] === 0) {
							$.nickName = (data['base'] && data['base'].nickname) || $.UserName;
						} else {
							$.nickName = $.UserName
						}
					} else {
						console.log(`京东服务器返回空数据`)
					}
				}
			} catch (e) {
				$.logErr(e, resp)
			} finally {
				resolve();
			}
		})
	})
}


function jsonParse(str) {
	if (typeof str == "string") {
		try {
			return JSON.parse(str);
		} catch (e) {
			console.log(e);
			$.msg($.name, '', '请勿随意在BoxJs输入框修改内容\n建议通过脚本去获取cookie')
			return [];
		}
	}
}

// 来自 @chavyleung 大佬
// https://raw.githubusercontent.com/chavyleung/scripts/master/Env.js
function Env(name, opts) {
	class Http {
		constructor(env) {
			this.env = env
		}

		send(opts, method = 'GET') {
			opts = typeof opts === 'string' ? {
				url: opts
			} : opts
			let sender = this.get
			if (method === 'POST') {
				sender = this.post
			}
			return new Promise((resolve, reject) => {
				sender.call(this, opts, (err, resp, body) => {
					if (err) reject(err)
					else resolve(resp)
				})
			})
		}

		get(opts) {
			return this.send.call(this.env, opts)
		}

		post(opts) {
			return this.send.call(this.env, opts, 'POST')
		}
	}

	return new(class {
		constructor(name, opts) {
			this.name = name
			this.http = new Http(this)
			this.data = null
			this.dataFile = 'box.dat'
			this.logs = []
			this.isMute = false
			this.isNeedRewrite = false
			this.logSeparator = '\n'
			this.startTime = new Date().getTime()
			Object.assign(this, opts)
			this.log('', `🔔${this.name}, 开始!`)
		}

		isNode() {
			return 'undefined' !== typeof module && !!module.exports
		}

		isQuanX() {
			return 'undefined' !== typeof $task
		}

		isSurge() {
			return 'undefined' !== typeof $httpClient && 'undefined' === typeof $loon
		}

		isLoon() {
			return 'undefined' !== typeof $loon
		}

		toObj(str, defaultValue = null) {
			try {
				return JSON.parse(str)
			} catch {
				return defaultValue
			}
		}

		toStr(obj, defaultValue = null) {
			try {
				return JSON.stringify(obj)
			} catch {
				return defaultValue
			}
		}

		getjson(key, defaultValue) {
			let json = defaultValue
			const val = this.getdata(key)
			if (val) {
				try {
					json = JSON.parse(this.getdata(key))
				} catch {}
			}
			return json
		}

		setjson(val, key) {
			try {
				return this.setdata(JSON.stringify(val), key)
			} catch {
				return false
			}
		}

		getScript(url) {
			return new Promise((resolve) => {
				this.get({
					url
				}, (err, resp, body) => resolve(body))
			})
		}

		runScript(script, runOpts) {
			return new Promise((resolve) => {
				let httpapi = this.getdata('@chavy_boxjs_userCfgs.httpapi')
				httpapi = httpapi ? httpapi.replace(/\n/g, '').trim() : httpapi
				let httpapi_timeout = this.getdata('@chavy_boxjs_userCfgs.httpapi_timeout')
				httpapi_timeout = httpapi_timeout ? httpapi_timeout * 1 : 20
				httpapi_timeout = runOpts && runOpts.timeout ? runOpts.timeout : httpapi_timeout
				const [key, addr] = httpapi.split('@')
				const opts = {
					url: `http://${addr}/v1/scripting/evaluate`,
					body: {
						script_text: script,
						mock_type: 'cron',
						timeout: httpapi_timeout
					},
					headers: {
						'X-Key': key,
						'Accept': '*/*'
					}
				}
				this.post(opts, (err, resp, body) => resolve(body))
			}).catch((e) => this.logErr(e))
		}

		loaddata() {
			if (this.isNode()) {
				this.fs = this.fs ? this.fs : require('fs')
				this.path = this.path ? this.path : require('path')
				const curDirDataFilePath = this.path.resolve(this.dataFile)
				const rootDirDataFilePath = this.path.resolve(process.cwd(), this.dataFile)
				const isCurDirDataFile = this.fs.existsSync(curDirDataFilePath)
				const isRootDirDataFile = !isCurDirDataFile && this.fs.existsSync(rootDirDataFilePath)
				if (isCurDirDataFile || isRootDirDataFile) {
					const datPath = isCurDirDataFile ? curDirDataFilePath : rootDirDataFilePath
					try {
						return JSON.parse(this.fs.readFileSync(datPath))
					} catch (e) {
						return {}
					}
				} else return {}
			} else return {}
		}

		writedata() {
			if (this.isNode()) {
				this.fs = this.fs ? this.fs : require('fs')
				this.path = this.path ? this.path : require('path')
				const curDirDataFilePath = this.path.resolve(this.dataFile)
				const rootDirDataFilePath = this.path.resolve(process.cwd(), this.dataFile)
				const isCurDirDataFile = this.fs.existsSync(curDirDataFilePath)
				const isRootDirDataFile = !isCurDirDataFile && this.fs.existsSync(rootDirDataFilePath)
				const jsondata = JSON.stringify(this.data)
				if (isCurDirDataFile) {
					this.fs.writeFileSync(curDirDataFilePath, jsondata)
				} else if (isRootDirDataFile) {
					this.fs.writeFileSync(rootDirDataFilePath, jsondata)
				} else {
					this.fs.writeFileSync(curDirDataFilePath, jsondata)
				}
			}
		}

		lodash_get(source, path, defaultValue = undefined) {
			const paths = path.replace(/\[(\d+)\]/g, '.$1').split('.')
			let result = source
			for (const p of paths) {
				result = Object(result)[p]
				if (result === undefined) {
					return defaultValue
				}
			}
			return result
		}

		lodash_set(obj, path, value) {
			if (Object(obj) !== obj) return obj
			if (!Array.isArray(path)) path = path.toString().match(/[^.[\]]+/g) || []
			path
				.slice(0, -1)
				.reduce((a, c, i) => (Object(a[c]) === a[c] ? a[c] : (a[c] = Math.abs(path[i + 1]) >> 0 === +path[i + 1] ? [] : {})), obj)[
					path[path.length - 1]
				] = value
			return obj
		}

		getdata(key) {
			let val = this.getval(key)
			// 如果以 @
			if (/^@/.test(key)) {
				const [, objkey, paths] = /^@(.*?)\.(.*?)$/.exec(key)
				const objval = objkey ? this.getval(objkey) : ''
				if (objval) {
					try {
						const objedval = JSON.parse(objval)
						val = objedval ? this.lodash_get(objedval, paths, '') : val
					} catch (e) {
						val = ''
					}
				}
			}
			return val
		}

		setdata(val, key) {
			let issuc = false
			if (/^@/.test(key)) {
				const [, objkey, paths] = /^@(.*?)\.(.*?)$/.exec(key)
				const objdat = this.getval(objkey)
				const objval = objkey ? (objdat === 'null' ? null : objdat || '{}') : '{}'
				try {
					const objedval = JSON.parse(objval)
					this.lodash_set(objedval, paths, val)
					issuc = this.setval(JSON.stringify(objedval), objkey)
				} catch (e) {
					const objedval = {}
					this.lodash_set(objedval, paths, val)
					issuc = this.setval(JSON.stringify(objedval), objkey)
				}
			} else {
				issuc = this.setval(val, key)
			}
			return issuc
		}

		getval(key) {
			if (this.isSurge() || this.isLoon()) {
				return $persistentStore.read(key)
			} else if (this.isQuanX()) {
				return $prefs.valueForKey(key)
			} else if (this.isNode()) {
				this.data = this.loaddata()
				return this.data[key]
			} else {
				return (this.data && this.data[key]) || null
			}
		}

		setval(val, key) {
			if (this.isSurge() || this.isLoon()) {
				return $persistentStore.write(val, key)
			} else if (this.isQuanX()) {
				return $prefs.setValueForKey(val, key)
			} else if (this.isNode()) {
				this.data = this.loaddata()
				this.data[key] = val
				this.writedata()
				return true
			} else {
				return (this.data && this.data[key]) || null
			}
		}

		initGotEnv(opts) {
			this.got = this.got ? this.got : require('got')
			this.cktough = this.cktough ? this.cktough : require('tough-cookie')
			this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar()
			if (opts) {
				opts.headers = opts.headers ? opts.headers : {}
				if (undefined === opts.headers.Cookie && undefined === opts.cookieJar) {
					opts.cookieJar = this.ckjar
				}
			}
		}

		get(opts, callback = () => {}) {
			if (opts.headers) {
				delete opts.headers['Content-Type']
				delete opts.headers['Content-Length']
			}
			if (this.isSurge() || this.isLoon()) {
				if (this.isSurge() && this.isNeedRewrite) {
					opts.headers = opts.headers || {}
					Object.assign(opts.headers, {
						'X-Surge-Skip-Scripting': false
					})
				}
				$httpClient.get(opts, (err, resp, body) => {
					if (!err && resp) {
						resp.body = body
						resp.statusCode = resp.status
					}
					callback(err, resp, body)
				})
			} else if (this.isQuanX()) {
				if (this.isNeedRewrite) {
					opts.opts = opts.opts || {}
					Object.assign(opts.opts, {
						hints: false
					})
				}
				$task.fetch(opts).then(
					(resp) => {
						const {
							statusCode: status,
							statusCode,
							headers,
							body
						} = resp
						callback(null, {
							status,
							statusCode,
							headers,
							body
						}, body)
					},
					(err) => callback(err)
				)
			} else if (this.isNode()) {
				this.initGotEnv(opts)
				this.got(opts)
					.on('redirect', (resp, nextOpts) => {
						try {
							if (resp.headers['set-cookie']) {
								const ck = resp.headers['set-cookie'].map(this.cktough.Cookie.parse).toString()
								if (ck) {
									this.ckjar.setCookieSync(ck, null)
								}
								nextOpts.cookieJar = this.ckjar
							}
						} catch (e) {
							this.logErr(e)
						}
						// this.ckjar.setCookieSync(resp.headers['set-cookie'].map(Cookie.parse).toString())
					})
					.then(
						(resp) => {
							const {
								statusCode: status,
								statusCode,
								headers,
								body
							} = resp
							callback(null, {
								status,
								statusCode,
								headers,
								body
							}, body)
						},
						(err) => {
							const {
								message: error,
								response: resp
							} = err
							callback(error, resp, resp && resp.body)
						}
					)
			}
		}

		post(opts, callback = () => {}) {
			// 如果指定了请求体, 但没指定`Content-Type`, 则自动生成
			if (opts.body && opts.headers && !opts.headers['Content-Type']) {
				opts.headers['Content-Type'] = 'application/x-www-form-urlencoded'
			}
			if (opts.headers) delete opts.headers['Content-Length']
			if (this.isSurge() || this.isLoon()) {
				if (this.isSurge() && this.isNeedRewrite) {
					opts.headers = opts.headers || {}
					Object.assign(opts.headers, {
						'X-Surge-Skip-Scripting': false
					})
				}
				$httpClient.post(opts, (err, resp, body) => {
					if (!err && resp) {
						resp.body = body
						resp.statusCode = resp.status
					}
					callback(err, resp, body)
				})
			} else if (this.isQuanX()) {
				opts.method = 'POST'
				if (this.isNeedRewrite) {
					opts.opts = opts.opts || {}
					Object.assign(opts.opts, {
						hints: false
					})
				}
				$task.fetch(opts).then(
					(resp) => {
						const {
							statusCode: status,
							statusCode,
							headers,
							body
						} = resp
						callback(null, {
							status,
							statusCode,
							headers,
							body
						}, body)
					},
					(err) => callback(err)
				)
			} else if (this.isNode()) {
				this.initGotEnv(opts)
				const {
					url,
					..._opts
				} = opts
				this.got.post(url, _opts).then(
					(resp) => {
						const {
							statusCode: status,
							statusCode,
							headers,
							body
						} = resp
						callback(null, {
							status,
							statusCode,
							headers,
							body
						}, body)
					},
					(err) => {
						const {
							message: error,
							response: resp
						} = err
						callback(error, resp, resp && resp.body)
					}
				)
			}
		}
		/**
		 *
		 * 示例:$.time('yyyy-MM-dd qq HH:mm:ss.S')
		 *    :$.time('yyyyMMddHHmmssS')
		 *    y:年 M:月 d:日 q:季 H:时 m:分 s:秒 S:毫秒
		 *    其中y可选0-4位占位符、S可选0-1位占位符，其余可选0-2位占位符
		 * @param {*} fmt 格式化参数
		 *
		 */
		time(fmt) {
			let o = {
				'M+': new Date().getMonth() + 1,
				'd+': new Date().getDate(),
				'H+': new Date().getHours(),
				'm+': new Date().getMinutes(),
				's+': new Date().getSeconds(),
				'q+': Math.floor((new Date().getMonth() + 3) / 3),
				'S': new Date().getMilliseconds()
			}
			if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (new Date().getFullYear() + '').substr(4 - RegExp.$1.length))
			for (let k in o)
				if (new RegExp('(' + k + ')').test(fmt))
					fmt = fmt.replace(RegExp.$1, RegExp.$1.length == 1 ? o[k] : ('00' + o[k]).substr(('' + o[k]).length))
			return fmt
		}

		/**
		 * 系统通知
		 *
		 * > 通知参数: 同时支持 QuanX 和 Loon 两种格式, EnvJs根据运行环境自动转换, Surge 环境不支持多媒体通知
		 *
		 * 示例:
		 * $.msg(title, subt, desc, 'twitter://')
		 * $.msg(title, subt, desc, { 'open-url': 'twitter://', 'media-url': 'https://github.githubassets.com/images/modules/open_graph/github-mark.png' })
		 * $.msg(title, subt, desc, { 'open-url': 'https://bing.com', 'media-url': 'https://github.githubassets.com/images/modules/open_graph/github-mark.png' })
		 *
		 * @param {*} title 标题
		 * @param {*} subt 副标题
		 * @param {*} desc 通知详情
		 * @param {*} opts 通知参数
		 *
		 */
		msg(title = name, subt = '', desc = '', opts) {
			const toEnvOpts = (rawopts) => {
				if (!rawopts) return rawopts
				if (typeof rawopts === 'string') {
					if (this.isLoon()) return rawopts
					else if (this.isQuanX()) return {
						'open-url': rawopts
					}
					else if (this.isSurge()) return {
						url: rawopts
					}
					else return undefined
				} else if (typeof rawopts === 'object') {
					if (this.isLoon()) {
						let openUrl = rawopts.openUrl || rawopts.url || rawopts['open-url']
						let mediaUrl = rawopts.mediaUrl || rawopts['media-url']
						return {
							openUrl,
							mediaUrl
						}
					} else if (this.isQuanX()) {
						let openUrl = rawopts['open-url'] || rawopts.url || rawopts.openUrl
						let mediaUrl = rawopts['media-url'] || rawopts.mediaUrl
						return {
							'open-url': openUrl,
							'media-url': mediaUrl
						}
					} else if (this.isSurge()) {
						let openUrl = rawopts.url || rawopts.openUrl || rawopts['open-url']
						return {
							url: openUrl
						}
					}
				} else {
					return undefined
				}
			}
			if (!this.isMute) {
				if (this.isSurge() || this.isLoon()) {
					$notification.post(title, subt, desc, toEnvOpts(opts))
				} else if (this.isQuanX()) {
					$notify(title, subt, desc, toEnvOpts(opts))
				}
			}
			if (!this.isMuteLog) {
				let logs = ['', '==============📣系统通知📣==============']
				logs.push(title)
				subt ? logs.push(subt) : ''
				desc ? logs.push(desc) : ''
				console.log(logs.join('\n'))
				this.logs = this.logs.concat(logs)
			}
		}

		log(...logs) {
			if (logs.length > 0) {
				this.logs = [...this.logs, ...logs]
			}
			console.log(logs.join(this.logSeparator))
		}

		logErr(err, msg) {
			const isPrintSack = !this.isSurge() && !this.isQuanX() && !this.isLoon()
			if (!isPrintSack) {
				this.log('', `❗️${this.name}, 错误!`, err)
			} else {
				this.log('', `❗️${this.name}, 错误!`, err.stack)
			}
		}

		wait(time) {
			return new Promise((resolve) => setTimeout(resolve, time))
		}

		done(val = {}) {
			const endTime = new Date().getTime()
			const costTime = (endTime - this.startTime) / 1000
			this.log('', `🔔${this.name}, 结束! 🕛 ${costTime} 秒`)
			this.log()
			if (this.isSurge() || this.isQuanX() || this.isLoon()) {
				$done(val)
			}
		}
	})(name, opts)
}
