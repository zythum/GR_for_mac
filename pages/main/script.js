"use strict";
const slice = [].slice
const remote = require('electron').remote
const Menu = remote.Menu
const MenuItem = remote.MenuItem
const dialog = require('electron').dialog
const ipcRenderer = require('electron').ipcRenderer

let nodes = {};
[
  "camera-info", "photos", 
  "preview", "preview-info", "preview-content", "preview-content-photo",
  "[fn=select]", "[fn=download]",
  "[fn=preview]", "[fn=scale]", "[fn=refresh]",
  "[fn=fetch_camera_info]",
  "[fn=preview_download]",
  "[fn=preview_back]",
  "[fn=preview_info]"
].forEach( (query) => {
  nodes[query] = document.querySelector(query)
})

function template(name, data) {
  let template_str = document.querySelector(`[template="${name}"]`).text.trim()
  for ( let name in data) {
    if (data.hasOwnProperty(name)) {
      template_str = template_str.replace("${" + name + "}", data[name])
    }
  }
  return template_str
}

function fixArray (arrayOrNot) {
  return Array.isArray(arrayOrNot) ? arrayOrNot : []
}

function next () {
  var t, list = [], current;
  function next () {
    if (current = list.shift()) current(next)
  };
  return function(fn) {
    list.push(fn)
    clearTimeout(t)
    t = setTimeout(next)
  }
}

function photo_orientation_onload () {    
  this.parentNode.setAttribute("orientation", 
      this.naturalHeight > this.naturalWidth ? "portrait": "landscape")
  setTimeout(()=>{
    this.parentNode.removeAttribute("loading")
    this.parentNode.removeChild(this.nextSibling)
  }, 500)
}

//防止页面被pinch放大 略黑科技
document.addEventListener('mousewheel', (e) => {
  if (e.ctrlKey) e.preventDefault()
})

//缩放=======================================================
let dragContainer = nodes["[fn=scale]"]
let point = dragContainer.getElementsByTagName("point")[0]
const step = [19, 50, 81]
let ishoding = false

function getCloserNumberIndex(number, numberList) {
  let minDifference = Infinity
  let resultIndex = -1
  numberList.forEach( (one, index) => {
    var difference = Math.abs(number - one)
    if (difference < minDifference) {
      minDifference = difference
      resultIndex = index
    }
  })
  return resultIndex
}

function setDragByMouseEvent (e) {
  let pointHalfWidth = 8;
  let dragContainerRectLeft = dragContainer.getBoundingClientRect().left
  let left = e.clientX - pointHalfWidth - dragContainerRectLeft
  let stepIndex = getCloserNumberIndex(left, step)
  point.style.left = step[stepIndex] + 'px'
  nodes["photos"].setAttribute("item-size", stepIndex + 1)
  localStorage["scale_index"] = stepIndex
}

dragContainer.addEventListener("mousedown", (e) => {
  setDragByMouseEvent(e);
  ishoding = true;
})
document.addEventListener("mousemove", (e) => {
  if (ishoding) setDragByMouseEvent(e)
})
document.addEventListener("mouseup", (e) => ishoding = false )

//init
let index = (localStorage["scale_index"]|0) || 1;
point.style.left = step[index] + 'px'
nodes["photos"].setAttribute("item-size", index + 1)

//图片流中的内容=======================================================
const kSelectAttributeName = "select"
const kSelectCountIndexAttributeName = "select-count"
const itemTagName = "item"
const selectItemQuery = itemTagName + "[" + kSelectAttributeName + "]"
let selectCountIndex = 0

function selectedItems () {
  return slice.call( nodes["photos"].querySelectorAll(selectItemQuery) )
}
function items () {
  return slice.call( nodes["photos"].querySelectorAll(itemTagName) )
}

function downloadSelected () {
  let items = selectedItems()
  let sources = items.map(photo => photo.info.source)
  ipcRenderer.send('download', sources)
}

function previewSelected () {
  startPreview( lastSelectItem() )
}

function updateNavButtonStates () {
  clearTimeout(updateNavButtonStates._timer)
  updateNavButtonStates._timer = setTimeout( () => {
    let itemsLength = items().length
    let selectItemsLength = selectedItems().length

    //全选按钮
    if (selectItemsLength === 0) {
      nodes["[fn=select]"].setAttribute("check", "none")
    } else if (selectItemsLength === itemsLength) {
      nodes["[fn=select]"].setAttribute("check", "all")
    } else {
      nodes["[fn=select]"].setAttribute("check", "some")
    }
    //下载按钮， 预览按钮
    if (selectItemsLength === 0) {
      nodes["[fn=download]"].setAttribute("disable", "")
      nodes["[fn=preview]"].setAttribute("disable", "")
    } else {
      nodes["[fn=download]"].removeAttribute("disable")
      nodes["[fn=preview]"].removeAttribute("disable")
    }

    //清空当前最后选择
    if (selectItemsLength === 0) {
      selectCountIndex = 0
    }

  }, 0);
}

function lastSelectItem () {
  return selectedItems().reduce((prev, item) => {
    if (!prev) return item
    let prevIndex = parseInt( prev.getAttribute(kSelectCountIndexAttributeName) )
    let itemIndex = parseInt( item.getAttribute(kSelectCountIndexAttributeName) )
    return itemIndex > prevIndex ? item : prev
  }, null)
}

function cancelAllSelect () {
  selectedItems().forEach(function (item) {
    cancelSelectItem(item)
  })
  updateNavButtonStates()
}
function selectAll () {
  items().forEach(function (item) {
    selectItem(item)
  })
  updateNavButtonStates()
}

function selectItem (item, needCountIndex) {
  if (arguments.length < 2) needCountIndex = true //needCountIndex缺损是true
  item.setAttribute(kSelectAttributeName, "")
  if (needCountIndex) {
    item.setAttribute(kSelectCountIndexAttributeName, ++selectCountIndex)
  }
  updateNavButtonStates()
}
function cancelSelectItem (item) {
  item.removeAttribute(kSelectAttributeName)
  item.removeAttribute(kSelectCountIndexAttributeName)
  updateNavButtonStates()
}

function toggleSelectItem (item) {
  if ( item.hasAttribute(kSelectAttributeName) ) {
    cancelSelectItem(item)
  } else {
    selectItem(item)
  }
}

function mousedownInPhoto (e) {
  let targetIsNotItem = e.target.tagName.toLowerCase() != itemTagName
  if (e.button == 0) { //鼠标左键
    if (e.shiftKey) {  //按cmd键
      if (targetIsNotItem) return
      if (e.target.hasAttribute(kSelectAttributeName)) return
      let _items = items()
      let range = [_items.indexOf(lastSelectItem()), _items.indexOf(e.target)].sort((a, b) => a - b)
      _items.slice(range[0], range[1] + 1).forEach((item) => selectItem(item))
    } else if (e.metaKey) { //按cmd键
      if (targetIsNotItem) return
      toggleSelectItem(e.target)
    } else {
      if (targetIsNotItem) return cancelAllSelect()
      if (e.target.hasAttribute(kSelectAttributeName)) return
      cancelAllSelect()
      selectItem(e.target)
    }
  }
}

nodes["photos"].addEventListener("mousedown", mousedownInPhoto)

//鼠标左键
nodes["photos"].addEventListener("contextmenu", (e) => {
  let targetIsNotItem = e.target.tagName.toLowerCase() != itemTagName
  if (targetIsNotItem) return
  if (!e.target.hasAttribute(kSelectAttributeName)) {
    cancelAllSelect()
    selectItem(e.target)
  }

  let items = selectedItems()
  let menu = new Menu();
  let spaces = "   ";
  if (items.length === 0) return
  if (items.length === 1) {
    menu.append(new MenuItem({ 
      label: "文件:" + spaces + items[0].info.file.split(".")[0], 
      enabled: false
    }))
    menu.append(new MenuItem({ 
      label: "目录:" + spaces  + items[0].info.dir,
      enabled: false
    }))
    menu.append(new MenuItem({ 
      label: "日期:" + spaces  + items[0].info.datetime.split("T")[0],
      enabled: false
    }))
    menu.append(new MenuItem({ 
      label: "时间:" + spaces  + items[0].info.datetime.split("T")[1],
      enabled: false
    }))
    menu.append(new MenuItem({ 
      label: "裁剪:" + spaces  + items[0].info.aspectRatio,
      enabled: false
    }))
    menu.append(new MenuItem({ 
      label: "光圈:" + spaces + "f" + items[0].info.av.replace('.', '/'),
      enabled: false
    }))
    menu.append(new MenuItem({ 
      label: "快门:" + spaces  + items[0].info.tv,
      enabled: false
    }))
    menu.append(new MenuItem({ 
      label: "ISO:" + spaces  + items[0].info.sv,
      enabled: false
    }))

  } else {
    menu.append(new MenuItem({ 
      label: `共${items.length}张`,
      enabled: false
    }))
  }
  menu.append(new MenuItem({ type: "separator" }))  
  menu.append(new MenuItem({ label: "预览图片", click: previewSelected}))
  menu.append(new MenuItem({ label: "下载到本地", click: downloadSelected}))  
  menu.popup(remote.getCurrentWindow())
  e.preventDefault()
})

nodes["[fn=select]"].addEventListener("mousedown", (e) => {
  if (nodes["[fn=select]"].getAttribute("check") === 'all') {
    return cancelAllSelect()
  }
  selectAll()
})

nodes["[fn=download]"].addEventListener("mousedown", (e) => {
  if (nodes["[fn=download]"].hasAttribute("disable")) return
  downloadSelected()
})

nodes["[fn=preview]"].addEventListener("mousedown", (e) => {
  if (nodes["[fn=preview]"].hasAttribute("disable")) return
  previewSelected()
})

//init
updateNavButtonStates();

//获取相机数据=======================================================
const host = "http://192.168.0.1"
const photoPath = `${host}/v1/photos`

let cameraInfo = nodes["camera-info"];

function objectEqual (o1, o2) {
  if (o1 === undefined || o2 === undefined) return false
  return JSON.stringify(o1) === JSON.stringify(o2)
}

let lastCameraInfo
function fetchCameraInfo () {
  fetch(`${host}/v1/props`)
    .then(response => response.json())
    .then(data => {
        if (data.errCode === 200) {
          if (objectEqual(lastCameraInfo, data)) return
          cameraInfo.innerHTML = template("camera-info", {
            model: data.model,
            firmwareVersion: data.firmwareVersion,
            serialNo: data.serialNo,
            macAddress: data.macAddress,
            battery: data.battery,
            remain: data.storages.reduce((prev, one) => prev + one.remain, 0)
          })
          if (lastCameraInfo === undefined) {
            fetchPhotos()
          }
          lastCameraInfo = data
          return;
        }
    })
}

function buildPhotos (data) {
  nodes["photos"].innerHTML = ''
  cancelAllSelect()
  updateNavButtonStates()  

  let _next = next()  

  function buildPhoto (photo, data) {
    let datetime = data.datetime.split('T')[0]
    let dArray = datetime.split('-')
    let datetimeNumber = dArray.join('') | 0
    let section = nodes["photos"].querySelector(`section[date="${datetimeNumber}"]`)
    if (!section) {
      let datetimeString = `${dArray[0]}年 ${dArray[1]}年 ${dArray[2]}日`
      section = document.createElement("section")
      section.setAttribute("date", datetimeNumber)
      section.setAttribute("desc", datetimeString)
      
      let sections = slice.call(nodes["photos"].childNodes)
      let i = 0, len = sections.length
      for (; i < len; i++) {
        let date = sections[i].getAttribute("date") | 0
        if (date < datetimeNumber) {
          nodes["photos"].insertBefore(section, sections[i])
          break
        }
      }
      if (i == len) nodes["photos"].appendChild(section)
    }

    let item = document.createElement("item")
    let img = new Image()
    let loadingIcon = document.createElement("i")
    loadingIcon.className = "fa fa-circle-o-notch fa-spin"
    item.setAttribute("loading", "")
    let type = photo.substring(photo.lastIndexOf('.') + 1) 
    item.setAttribute("type", type)
    img.onload = photo_orientation_onload

    section.appendChild(item).appendChild(img)
    item.appendChild(loadingIcon)
    img.src = photo + "?size=view"
    item.info = data
    data.source = photo
  }

  function eachPhoto (photo) {
    _next( next => {
      fetch(photo + '/info')
        .then(response => response.json())
        .then(data => {
          buildPhoto(photo, data)
          next()
        })
    })
  }

  fixArray(data.dirs)
    .reduce((prev, item) => {
      return prev.concat(fixArray(item.files).map(name => {
        return [photoPath, item.name, name].join("/")
      }))
    }, [])
    .reverse()
    .forEach(eachPhoto)
}

let lastPhotos
function fetchPhotos () {
  fetch(`${host}/v1/photos`)
    .then(response => response.json())
    .then(data => {
        if (data.errCode === 200) {
          if (objectEqual(lastPhotos, data)) return
          buildPhotos(lastPhotos = data)
          return;              
        }
    })
}

fetchCameraInfo()

nodes["[fn=fetch_camera_info]"].addEventListener("click", fetchCameraInfo)
nodes["[fn=refresh]"].addEventListener("click", fetchPhotos)


//预览==============================================================
const kPreviewingBodyAttributeName = "preview"
const kPreviewShowInfoAttributeName = "show-info"
let previewingItem = null
function startPreview (item) {
  if (!item) return cancelPreview()
  document.body.setAttribute(kPreviewingBodyAttributeName, "")
  previewingItem = item  
  nodes["preview-info"].innerHTML = template("preview-info", {
    file: previewingItem.info.file,
    dir: previewingItem.info.dir,
    date: previewingItem.info.datetime.split("T")[0],
    time: previewingItem.info.datetime.split("T")[1],
    aspectRatio: previewingItem.info.aspectRatio,
    av: previewingItem.info.av,
    tv: previewingItem.info.tv.replace(".", "/"),
    sv: previewingItem.info.sv
  })
  nodes["preview-content-photo"].style.cssText = 
  `background-image: url(${previewingItem.info.source}?size=view)`
}

function cancelPreview () {
  document.body.removeAttribute(kPreviewingBodyAttributeName)
  previewingItem = null
  nodes["preview-content"].firstChild.src = null
}

nodes["[fn=preview]"].addEventListener("click", (e) => {
  if (!nodes["[fn=preview]"].hasAttribute("disable")) {
    startPreview( lastSelectItem() )
  }
})
nodes["[fn=preview_back]"].addEventListener("click", cancelPreview)
nodes["[fn=preview_info]"].addEventListener("click", (e) => {
  if (nodes["preview"].hasAttribute(kPreviewShowInfoAttributeName)) {
    nodes["preview"].removeAttribute(kPreviewShowInfoAttributeName)
  } else {
    nodes["preview"].setAttribute(kPreviewShowInfoAttributeName, "")
  }
})

document.addEventListener('mousewheel', (e) => {
  let photo = nodes["preview-content-photo"]
  let container = nodes["preview-content"]
  if ( e.target === photo && 
    e.ctrlKey && e.deltaY % 1 !== 0 ) {

    let scale = photo.scale || 1
    let baseWidth = container.offsetWidth
    let baseHeight = container.offsetHeight

    let photoHeight = baseHeight * scale    
    let difference = (photoHeight - e.deltaY * 10) / photoHeight

    let newScale = scale * difference

    if (newScale < 1) newScale = 1, difference = 1
    if (newScale > 3) newScale = 3, difference = 1

    let mouseToPhotoDistanceLeft = e.clientX - photo.getBoundingClientRect().left
    let mouseToPhotoDistanceTop = e.clientY - photo.getBoundingClientRect().top

    let newMouseToPhotoDistanceLeft = mouseToPhotoDistanceLeft * difference
    let newMouseToPhotoDistanceTop = mouseToPhotoDistanceTop * difference

    let scrollFixLeft = newMouseToPhotoDistanceLeft - mouseToPhotoDistanceLeft
    let scrollFixTop = newMouseToPhotoDistanceTop - mouseToPhotoDistanceTop

    photo.style.width = photo.style.height = newScale * 100 + "%"
    container.scrollLeft += Math.round(scrollFixLeft)
    container.scrollTop += Math.round(scrollFixTop)
    
    photo.scale = newScale
  }
})

//键盘快捷键
function scrollItemIntoView (item) {
  let bounding = item.getBoundingClientRect()
  if (bounding.top < 60) {
    nodes["photos"].scrollTop = bounding.top - nodes["photos"].firstChild.getBoundingClientRect().top - 10
  } else if (bounding.bottom > nodes["photos"].offsetHeight) {
    nodes["photos"].scrollTop = bounding.bottom - nodes["photos"].firstChild.getBoundingClientRect().top - nodes["photos"].offsetHeight + 70
  }
}
function parseGrid (section) {
  let firstItem = section.firstChild
  let itemWidth = firstItem.offsetWidth + parseInt(document.defaultView.getComputedStyle(firstItem).marginRight)
  let cols = parseInt(section.offsetWidth / itemWidth)
  let rows = parseInt(section.childNodes.length / cols) + 1
  return {
    colLength () { return cols },
    rowLength () { return rows },
    itemFromPos (row, col) {
      if (col >= cols) return null
      return section.childNodes[cols * row + col]
    },
    posFromItem (item) {
      let childNodes = slice.call(section.childNodes)
      let index = childNodes.indexOf(item)
      let row = -1, col = -1
      if (index != -1) {
        row = parseInt(index / cols)
        col = index % cols
      }
      return [row, col]
    }
  }
}

function keyDownInPhotoKeyLeft () {
  let _lastSelectItem = lastSelectItem()
  let needSelectItem
  if (_lastSelectItem) {
    if (_lastSelectItem.previousSibling) {
      needSelectItem = _lastSelectItem.previousSibling
    } else if (_lastSelectItem.parentNode.previousSibling) {
      needSelectItem = _lastSelectItem.parentNode.previousSibling.lastChild
    }
  } else {
    let _items = items()
    needSelectItem = _items[_items.length - 1]
  }
  if (needSelectItem) {
    cancelAllSelect()
    selectItem(needSelectItem)
    scrollItemIntoView(needSelectItem)
  }
}

function keyDownInPhotoKeyRight () {
  let _lastSelectItem = lastSelectItem()
  let needSelectItem
  if (_lastSelectItem) {
    if (_lastSelectItem.nextSibling) {
      needSelectItem = _lastSelectItem.nextSibling
    } else if (_lastSelectItem.parentNode.nextSibling) {
      needSelectItem = _lastSelectItem.parentNode.nextSibling.firstChild
    }
  } else {
    needSelectItem = items()[0]
  }
  if (needSelectItem) {
    cancelAllSelect()
    selectItem(needSelectItem)
    scrollItemIntoView(needSelectItem)
  }
}

function keyDownInPhotoKeyUp () {
  let _lastSelectItem = lastSelectItem()
  let needSelectItem
  if (_lastSelectItem) {
    let section = _lastSelectItem.parentNode
    let grid = parseGrid(section)
    let _lastSelectItemPos = grid.posFromItem(_lastSelectItem)
    needSelectItem = grid.itemFromPos(_lastSelectItemPos[0] - 1, _lastSelectItemPos[1])
    if ( !needSelectItem && (section = section.previousSibling) ) {
      grid = parseGrid(section)
      let rowIndex = grid.rowLength()
      needSelectItem = grid.itemFromPos(rowIndex - 1, _lastSelectItemPos[1])
      if (!needSelectItem) needSelectItem = section.lastChild
    }
  } else {
    let _items = items()
    needSelectItem = _items[_items.length - 1]
  }
  if (needSelectItem) {
    cancelAllSelect()
    selectItem(needSelectItem)
    scrollItemIntoView(needSelectItem)
  }
}

function keyDownInPhotoKeyDown () {
  let _lastSelectItem = lastSelectItem()
  let needSelectItem
  if (_lastSelectItem) {
    let section = _lastSelectItem.parentNode
    let grid = parseGrid(section)
    let _lastSelectItemPos = grid.posFromItem(_lastSelectItem)
    let rowIndex = _lastSelectItemPos[0] + 1
    needSelectItem = grid.itemFromPos(rowIndex, _lastSelectItemPos[1])
    if ( !needSelectItem && rowIndex == grid.rowLength() - 1 ) {
      needSelectItem = section.lastChild 
    }
    if ( !needSelectItem && (section = section.nextSibling) ) {
      grid = parseGrid(section)
      let rowIndex = grid.rowLength()
      needSelectItem = grid.itemFromPos(0, _lastSelectItemPos[1])
      if (!needSelectItem) needSelectItem = section.lastChild
    }
  } else {
    needSelectItem = items()[0]
  }
  if (needSelectItem) {
    cancelAllSelect()
    selectItem(needSelectItem)
    scrollItemIntoView(needSelectItem)
  }
}
let isShiftKeyPressing = false
let shiftKeyPressing
function keyDownInPhotoKeyShift () {
  isShiftKeyPressing = true
}
function keyUpInPhotoKeyShift () {
  isShiftKeyPressing = false
}

function activeElementIsInput () {
  let focusElement = document.activeElement
  return (
    focusElement.tagName.toLowerCase === 'textarea' ||
    focusElement.tagName.toLowerCase === 'input' ||
    focusElement.getAttribute("contenteditable") === "true"
  )
}
let keyDownInPhotoMap = {
  37: keyDownInPhotoKeyLeft,
  38: keyDownInPhotoKeyUp,
  39: keyDownInPhotoKeyRight,
  40: keyDownInPhotoKeyDown
}
function keyDownInPhoto (e) {
  let keyDownInPhotoFn = keyDownInPhotoMap[e.keyCode]
  if (!activeElementIsInput() && keyDownInPhotoFn) {
    e.preventDefault()
    keyDownInPhotoFn() 
  }
}
document.documentElement.addEventListener("keydown", (e) => e.keyCode === 16 && keyDownInPhotoKeyShift() )
document.documentElement.addEventListener("keyup", (e) => e.keyCode === 16 && keyUpInPhotoKeyShift() )
document.documentElement.addEventListener("keydown", (e) => {
  if (document.body.hasAttribute(kPreviewingBodyAttributeName)) {

  } else {
    keyDownInPhoto(e)
  }
})


