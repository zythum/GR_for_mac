"use strict"
/*
  http://192.168.0.1/v1/props
  http://192.168.0.1/v1/photos
  http://192.168.0.1/v1/photos/100RICOH/R0000023.JPG?size=view
  http://192.168.0.1/v1/photos/100RICOH/R0000023.JPG
  http://192.168.0.1/v1/photos/100RICOH/R0000023.JPG/info
*/

// const request = require("request").defaults({timeout: 10000})
// 测试抓包
const request = require("request").defaults({timeout: 10000, proxy:"http://localhost:8888"})
const _ = null
const host = "http://192.168.0.1"

request.defaults({
  headers: {'x-token': 'my-token'}
})

function fixArray (arrayOrNot) {
  return Array.isArray(arrayOrNot) ? arrayOrNot : []
}

function resJsonPerse (resbody, callback) {
  try {
    let json = JSON.parse(resbody)
    if (json.errCode != 200)
      return callback(new Error(json.errCode || "data err"))

    delete json.errCode
    delete json.errMsg
    callback(_, json)
  } catch (err) {
    callback(new Error("format err"))
  }
}

exports.cameraInfo = (callback) => {
  request(`${host}/v1/props`, (err, res, body) => {
    console.log(err, res, body);
    if (!err && res.statusCode == 200) {
      resJsonPerse(body, callback)
    } else {
      callback(new Error("camera not found"))
    }
  })
}

//获取相机中所有图片地址
const photoPath = `${host}/v1/photos`
exports.photos = (callback) => {
  request(`${host}/v1/photos`, (err, res, 2body) => {
    if (!err && res.statusCode == 200) {
      resJsonPerse(body, function (err, json) {
        if (err) return callback(err)
        let list = fixArray(json.dirs).reduce((prev, item) => {
          let files = fixArray(item.files).map(name => [photoPath, item.name, name].join("/"))
          return prev.concat(files)
        }, [])
        callback(_, list)
      })
    } else {
      callback(new Error("network err"))
    }
  })
}

exports.photoInfo = (photoSrc, callback) => {
  request(`${photoSrc}/info`, (err, res, body) => {
    if (!err && res.statusCode == 200) {
      resJsonPerse(body, callback)
    } else {
      callback(new Error("network err"))
    }
  })
}
