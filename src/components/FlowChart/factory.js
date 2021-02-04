import Vue from 'vue'
import * as d3 from 'd3'
import { differenceWith, isEqual } from 'lodash'
import { v4 as uuidv4 } from 'uuid'
import { isFunction } from '@/utils/type'

import dagreD3 from 'dagre-d3'

import FlowChartNode from '@/components/FlowChart/node'

import styles from '@/styles/style.scss'

// 复用流程存储栈
class StackNode {
  constructor (nodeDataSet) {
    // 节点集合栈
    this.stack = [
      nodeDataSet
    ]
    this.cursor = 0 // 游标指针
  }

  // 出栈
  popStack () {
    this.stack.pop()
  }

  // 入栈
  pushStack (node) {
    this.stack.push(node)
    return this.stack
  }

  // 获取栈大小
  getStackSize () {
    return this.stack.length
  }

  // 获取栈顶节点
  getNodeAtTop () {
    const size = this.getStackSize()
    return this.stack[size - 1]
  }

  // 是否空栈
  isEmpty () {
    return !this.stack.length
  }

  isOnlyOne () {
    return this.getStackSize() === 1
  }

  // 清空栈
  clearStack () {
    this.stack = []
  }

  // 仅保留栈底节点
  getOnlyOneNode () {
    while (!this.isOnlyOne()) {
      this.popStack()
    }
    return this.getNodeAtTop()
  }

  // 仅保留指定个数节点
  getNodeByNumber (number = this.getStackSize()) {
    while (number < this.getStackSize()) {
      this.popStack()
    }
    return this.getNodeAtTop()
  }

  // 获取栈顶前一个节点
  getNodeAtSecondTop () {
    const size = this.getStackSize()
    if (size <= 1) {
      return this.getNodeAtTop()
    }
    return this.stack[size - 2]
  }
}

export default class FlowChartFactory {
  constructor (nodeDataSet, root) {
    if (!nodeDataSet || !root) return

    this.root = root
    this.nodeStack = new StackNode(nodeDataSet)
    this.animationDateSequenceGroup = new AnimationDateSequenceGroup()
    this.flowchart = {
      zoom: {},
      graph: {},
      chart: '',
      chartGroup: '',
      containerSize: {},
      graphSize: {},
      render: {},
      initialScale: 0.5,
      AnimationSequence: [] // 小球动画序列
    }
    this.nodeIdSeparator = 'Separator_node'
    this.edgeIdSeparator = 'Separator_edge'
    this.createFactory()
  }

  resize () {
    setTimeout(() => {
      this.createFactory()
    })
  }

  createFactory () {
    this.removeSvg()
    this.setInitOptions()
    this.createGraph()
    this.setGraphZoom()
    this.renderGraph()
    this.getGraphClientRect()
    this.setScaleByGraphAdaptToContainer()
    this.setGraphCenter({
      disabledTransition: true
    })
    this.createTransitionList()

    // TODO: 高亮新流程 (测试用)
    // this.createHighlightRoutes('start', 1)
    // this.createHighlightRoutes(2, 3)
    // this.createHighlightRoutes(7, 'end')
    // this.createHighlightRoutes(4, 7)

    // TODO: 创建小球动画 (测试用1)
    // this.combineVirtualRoutes(['start', 1])
    // this.createAnimationForVirtualRoutes()

    // TODO: 创建小球动画 (测试用2)
    // this.combineVirtualRoutes([2, 3])
    // this.createAnimationForVirtualRoutes()
  }

  /**
   * 获取 svg 容器默认尺寸
   *
   * @return {*}
   */
  getContainerSize () {
    const { width, height } = this.root.parentNode.getBoundingClientRect()
    this.flowchart.containerSize = {
      width,
      height
    }
    return this.flowchart.containerSize
  }

  /**
   * 清空图形画布
   *
   * @alias removeChartGroup
   *
   */
  removeSvg () {
    d3.select(this.root).selectAll('*').remove()
    this.flowchart.chartGroup && this.flowchart.chartGroup.remove()
    return this.flowchart.chartGroup
  }

  /**
   * 初始化盒子容器
   *
   * @alias createChart
   *
   * @return {*}
   */
  setInitOptions () {
    const { width, height } = this.getContainerSize()
    const chart = d3
      .select(this.root)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'none')

    this.flowchart.chart = chart
    this.fixRenderGlitch()

    const chartGroup = chart.append('g')
    this.flowchart.chartGroup = chartGroup

    return {
      chart,
      chartGroup
    }
  }

  /**
   * 修复拖动时出现重绘故障行为的 bug & D3 zoom not working with mousewheel in safari
   *
   */
  fixRenderGlitch () {
    const { width, height } = this.getContainerSize()
    let rect = this.flowchart.chart
      .select('rect.rect-place-holder')
    if (rect.empty()) {
      rect = this.flowchart.chart
        .append('rect')
        .attr('class', 'rect-place-holder')
    }

    rect
      .attr('fill', '#fff')
      .attr('stroke', 'none')
      .attr('width', width)
      .attr('height', height)
      .attr('x', '0')
      .attr('y', '0')
  }

  /**
   * 创建 dagreD3 graph 图形
   *
   * @param {*} rankdir 绘制方向
   * @return {*}
   */
  createGraph (rankdir = 'TB') {
    // 初始化创建 dagreD3
    const graph = new dagreD3.graphlib.Graph()
    graph.setGraph({
      rankdir
    })
    const nodeDataSet = this.nodeStack.getNodeAtTop()

    if (
      !nodeDataSet ||
      !nodeDataSet.nodes
    ) return

    // 添加节点
    nodeDataSet.nodes.forEach(node => {
      const element = this.getGraphCustomNode(node, FlowChartNode)
      graph.setNode(node.id, {
        id: `node${this.nodeIdSeparator}${node.id}`,
        label: element,
        labelType: 'html',
        padding: 0,
        style: `
          fill: none;
          stroke: none;
        `
      })
    })
    // 添加节点关系
    nodeDataSet.edges.forEach(edge => {
      const sourceEdge = nodeDataSet.nodes.find((node) => node.id === edge.source)
      const targetEdge = nodeDataSet.nodes.find((node) => node.id === edge.target)
      if (!targetEdge || !sourceEdge) {
        return
      }
      const hasDefaultEdge = (edge) => {
        const defaultNodeIds = [0, -1, 'start', 'end', '_start', '_end']
        return defaultNodeIds.includes(edge.source) ||
        defaultNodeIds.includes(edge.target)
      }

      graph.setEdge(edge.source, edge.target, {
        label: edge.label,
        id: `path${this.edgeIdSeparator}${edge.source}${this.edgeIdSeparator}${edge.target}`,
        style: `
          fill: none;
          ${
            // TODO: 可抽离配置，目前是将数据结构写死的，开始和结束特殊标记
            hasDefaultEdge(edge)
              ? 'stroke-dasharray: 5, 5'
              : ''
          };
        `,
        arrowhead: 'hollowPoint',
        curve: d3.curveBasis
      })
    })

    this.flowchart.graph = graph

    return graph
  }

  /**
   * 获取增加节点前后的差异节点数据
   *
   */
  getDifferenceBeforeAndAfterEdge () {
    const firstSet = JSON.parse(JSON.stringify(this.nodeStack.getNodeAtTop()))
    const secondSet = JSON.parse(JSON.stringify(this.nodeStack.getNodeAtSecondTop()))

    // 忽略 label
    firstSet.edges = firstSet.edges.map(edge => {
      return {
        source: edge.source,
        target: edge.target
      }
    })
    secondSet.edges = secondSet.edges.map(edge => {
      return {
        source: edge.source,
        target: edge.target
      }
    })

    if (!firstSet || !secondSet) {
      return []
    }

    let results = differenceWith(firstSet.edges, secondSet.edges, isEqual)
    if (!results.length) {
      results = differenceWith(secondSet.edges, firstSet.edges, isEqual)
    }
    return results
  }

  /**
   * 获取设置的自定义节点
   *
   * @param {*} graph
   * @param {*} node
   * @param {*} component
   * @return {*}
   */
  getGraphCustomNode (node, component) {
    const Chart = Vue.extend(component)
    const instance = new Chart({
      data: {
        title: node.label,
        count: node.count,
        type: node.type,
        icon: node.icon
      }
    })
    const vm = instance.$mount()
    return vm.$el
  }

  /**
   * 设置图形在容器中自适应显示的缩放比率
   *
   * @return {Number} scale
   */
  setScaleByGraphAdaptToContainer () {
    const containerSize = this.getContainerSize()

    const numString = (
      Math.min(
        containerSize.width / this.flowchart.graphSize.width,
        containerSize.height / this.flowchart.graphSize.height
      ) * (containerSize.width <= 470 ? 0.5 : 0.85)
    ).toFixed(3)

    this.flowchart.initialScale = parseFloat(numString)

    return this.flowchart.initialScale
  }

  /**
   * 设置图形缩放比例
   *
   */
  setGraphInnerContainerScale () {
    Vue.nextTick(() => {
      this.flowchart.zoom.scaleTo(
        this.flowchart.chart
          .transition()
          .duration(750)
        ,
        this.flowchart.initialScale
      )
    })
  }

  /**
   * 设置缩小
   * @return {Boolean} true: 到达最小值
   */
  setScaleMin () {
    this.flowchart.initialScale -= 0.15
    if (this.flowchart.initialScale <= 0.15) {
      this.flowchart.initialScale = 0.15
      return true
    }

    this.setGraphInnerContainerScale()
    return false
  }

  /**
   * 设置放大
   * @return {Boolean} true: 到达最大值
   */
  setScaleMax () {
    if (this.flowchart.initialScale >= 2) {
      return true
    }

    this.flowchart.initialScale += 0.15
    this.setGraphInnerContainerScale()
    return false
  }

  /**
   * 设置缩放重置
   *
   */
  setScaleReset () {
    this.setScaleByGraphAdaptToContainer()
    this.setGraphCenter({
      disabledTransition: true
    })
  }

  /**
   * 建立拖拽缩放
   *
   * @alias createGraphZoom
   *
   * @return {*}
   */
  setGraphZoom () {
    const zoom = d3
      .zoom()
      .on('zoom', () => {
        this.flowchart.chartGroup.attr(
          'transform',
          d3.event.transform
        )
        this.fixRenderGlitch()
      })
    this.flowchart.chart.call(zoom)
    this.flowchart.zoom = zoom
    return zoom
  }

  /**
   * 渲染 dagreD3 生成器
   *
   * @alias setRenderGraph
   *
   * @return {*} render
   */
  renderGraph () {
    const R = dagreD3.render
    let render = new R()
    render = this.setRenderCustomArrows(render)
    render(this.flowchart.chartGroup, this.flowchart.graph)
    this.flowchart.render = render
    return render
  }

  /**
   * 自定义渲染路径箭头
   *
   * @param {*} render
   * @return {*} render
   */
  setRenderCustomArrows (render) {
    render.arrows().hollowPoint = (parent, id, edge, type) => {
      const marker = parent.append('marker')
        .attr('id', id)
        .attr('viewBox', '0 0 32 32')
        .attr('refX', 9)
        .attr('refY', 5)
        // 设置 markerUnits 的值： userSpaceOnUse 为固定尺寸, strokeWidth 为跟随线条尺寸变化
        .attr('markerUnits', 'strokeWidth')
        .attr('markerWidth', 10)
        .attr('markerHeight', 10)
        .attr('orient', 'auto')

      const group = marker.append('g')

      // 解决路径粗线条的末端与箭头顶尖重叠时会漏出的 bug
      // 1. 加一个与背景颜色相同的白色蒙层
      group
        .append('rect')
        .attr('width', '10')
        .attr('height', '10')
        .style('fill', '#fff')
      // 2. 在蒙层里再加一个三角箭头
      group
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .style('fill', styles.chartLightColor)
      dagreD3.util.applyStyle(group, edge[type + 'Style'])
    }
    return render
  }

  /**
   * 获取 dagreD3 graph 图形尺寸
   *
   * @param {*} graph
   * @return {*}
   */
  getGraphClientRect () {
    const { width, height } = this.flowchart.graph.graph()
    this.flowchart.graphSize = {
      width,
      height
    }
    return this.flowchart.graphSize
  }

  /**
   * 渲染完毕后的图纸居中
   *
   * @return {*}
   */
  setGraphCenter (options = {}) {
    options = Object.assign({}, {
      disabledTransition: false
    }, options)

    const containerSize = this.getContainerSize()
    const graphSize = this.getGraphClientRect()

    const transition = options.disabledTransition
      ? this.flowchart.chart
      : this.flowchart.chart.transition()
        .duration(750)

    transition.call(
      this.flowchart.zoom.transform,
      d3.zoomIdentity
        .translate(
          (containerSize.width - graphSize.width * this.flowchart.initialScale) / 2,
          (containerSize.height - graphSize.height * this.flowchart.initialScale) / 2
        )
        .scale(this.flowchart.initialScale)
    )
    return this.flowchart.chart
  }

  /**
   * 获取节点 node 集合
   *
   * @param {*} [range=[]]
   * @return {*}
   */
  getNodeList (range = []) {
    const nodeList = this.flowchart.chart.selectAll('.nodes > .node')
    const _self = this
    return !range.length
      ? nodeList
      : nodeList.filter(function () {
        const flag = Number(
          d3
            .select(this)
            .attr('id')
            .split(_self.nodeIdSeparator)[1]
        )
        return range.includes(flag)
      })
  }

  /**
   * 根据 id 查找 node 节点
   *
   * @param {*} nodeList
   * @param {*} id
   * @return {*} single node
   */
  findNodeById (nodeList, id) {
    const target = `node${this.nodeIdSeparator}${id}`
    return nodeList
      .nodes()
      .find(
        source => source.id === target
      )
  }

  /**
   * 获取路线 path 集合
   *
   * @return {*} {pathGroupList, pathList}
   */
  getPathLineList () {
    const pathList = []
    const pathGroupList = this.flowchart.chart
      .selectAll('.edgePaths > .edgePath')
      .each(function () {
        const $pathNode = d3
          .select(this)
          .select('path')
          .node()
        pathList.push($pathNode)
      })
    return {
      pathGroupList, // 带 g.path 集合
      pathList: d3.selectAll(pathList) // 纯 path 集合
    }
  }

  /**
   * 给定节点集合，返回对应路线
   *
   * @param {*} [range=[0, 1]]
   * @return {*}
   */
  getPathListByNodesId (range = [0, 1]) {
    const { pathGroupList } = this.getPathLineList()

    const ids = []
    const prefix = `path${this.edgeIdSeparator}`

    if (range.length) {
      range.reduce((prev, next) => {
        ids.push(`${prefix}${prev}${this.edgeIdSeparator}${next}`)
        return next
      })
    }

    return d3.selectAll(
      ids.map(id => {
        return pathGroupList
          .nodes()
          .find(
            target => target.id === id
          )
      })
    )
  }

  /**
   * 解析并获取 transform: translate
   *
   * @param {*} element
   * @return {Object} {x, y, z}
   */
  getTranslateValues (element) {
    function parseAttributePolyfill (el) {
      const transform = el.getAttribute('transform')
      const result = {
        translate: []
      }
      const value = transform.match(new RegExp(/(\w+)\(([^,)]+),?([^)]+)?\)/, 'gi'))
      for (const i in value) {
        const c = value[i].match(new RegExp('[\\w\\.\\-]+', 'g'))
        result[c.shift()] = c
      }
      const { translate: [x, y] } = result
      return {
        x: x || 0,
        y: y || 0
      }
    }

    const style = window.getComputedStyle(element)
    const matrix =
      style.transform || style.webkitTransform || style.mozTransform

    // No transform property. Simply return 0 values.
    if (matrix === 'none') {
      return parseAttributePolyfill(element)
    }

    // Can either be 2d or 3d transform
    const matrixType = matrix.includes('3d') ? '3d' : '2d'
    const matrixValues = matrix.match(new RegExp(/matrix.*\((.+)\)/))[1].split(', ')

    // 2d matrices have 6 values
    // Last 2 values are X and Y.
    // 2d matrices does not have Z value.
    if (matrixType === '2d') {
      return {
        x: matrixValues[4],
        y: matrixValues[5],
        z: 0
      }
    }

    // 3d matrices have 16 values
    // The 13th, 14th, and 15th values are X, Y, and Z
    if (matrixType === '3d') {
      return {
        x: matrixValues[12],
        y: matrixValues[13],
        z: matrixValues[14]
      }
    }
  }

  /**
   * 创建线条过渡效果
   *
   * @return {*} New pathList
   */
  createTransitionList (options = {}) {
    let { pathList, pathGroupList } = this.getPathLineList()
    options = Object.assign({}, {
      disabledTransition: true
    }, options)
    pathList = pathList
      .attr('stroke-width', '5')
      .attr('fill', 'none')

    // FIX: 修复当路由发生改变时，marker-end 引用箭头消失的问题
    pathGroupList
      .each(function () {
        const markerId = d3
          .select(this)
          .select('marker')
          .attr('id')
        d3
          .select(this)
          .select('path')
          .attr('marker-end', `url(#${markerId})`)
      })

    if (options.disabledTransition) {
      pathList
        .attr('stroke', styles.chartLightColor)
        .attr('opacity', 1)
      return
    }

    pathList
      .attr('opacity', 0)
      .transition()
      .duration(1500)
      .ease(d3.easeLinear)
      .delay(400)
      .attrTween('stroke-dashoffset', function () {
        const $path = d3.select(this)
        const totalLength = $path.node().getTotalLength()
        $path.attr('stroke-dasharray', `${totalLength}, ${totalLength}`)
        return function (t) {
          return totalLength * (1 - t)
        }
      })
      .attrTween('marker-end', function () {
        const $path = d3.select(this)
        const marker = $path.attr('marker-end')
        $path.attr('marker-end', '')
        return function () {
          return marker
        }
      })
      .attr('stroke', styles.chartLightColor)
      .attr('opacity', 1)
    return pathList
  }

  /* combineVirtualRoutes, createAnimationForVirtualRoutes 两个动画方法原位置 */

  /**
   * 创建线条高亮效果动画
   *
   * @param {*} sourceId
   * @param {*} targetId
   */
  createHighlightRoutes (sourceId, targetId) {
    const { pathList } = this.getPathLineList()

    const pathId = `#path${this.edgeIdSeparator}${sourceId}${this.edgeIdSeparator}${targetId}`

    const firstDelayTime = 250
    const firstTime = 250

    const endDelayTime = 1000
    const endTime = 1200

    pathList
      .attr('stroke-width', '5')

    const marker =
      d3
        .select(this.root)
        .select(pathId)
        .select('defs > marker')

    d3
      .select(this.root)
      .select(pathId)
      .select('path')
      .transition()
      .delay(firstDelayTime)
      .duration(firstTime)
      .attrTween('marker-end', function () {
        marker
          .select('path')
          .transition()
          .duration(firstTime)
          .style('fill', styles.chartHighlightColor)
      })
      .attr('stroke-width', '9')
      .attr('stroke', styles.chartHighlightColor)
      .transition()
      .delay(endDelayTime)
      .duration(endTime)
      .attr('stroke-width', '5')
      .attrTween('marker-end', function () {
        marker
          .select('path')
          .transition()
          .duration(endTime)
          .style('fill', styles.chartLightColor)
      })
      .attr('stroke', styles.chartLightColor)
  }

  /**
   * 添加新节点（下一个复用次数高的流程数据）
   *
   * @param {Object} { nodes, edges }
   */
  setNodeSetMax (nodeDataSet, notHighLight = false) {
    this.nodeStack.pushStack(nodeDataSet)

    this.createFactory()

    !notHighLight &&
    this.getDifferenceBeforeAndAfterEdge()
      .forEach(nodeDataSet => {
        const { source, target } = nodeDataSet
        this.createHighlightRoutes(source, target)
      })
  }

  /**
   * 减少流程节点（前一个复用次数高的流程数据）
   *
   */
  setNodeSetMin () {
    const isEnd = this.nodeStack.isOnlyOne()
    if (isEnd) return isEnd

    this.nodeStack.popStack()
    this.createFactory()
    return this.nodeStack.isOnlyOne()
  }

  /**
   * 重置流程节点
   *
   */
  setNodeSetReset () {
    this.nodeStack && this.nodeStack.getOnlyOneNode()
    this.createFactory()
  }

  // 获取当前流程节点进度
  getNodeCurrentStep () {
    return this.nodeStack.getStackSize()
  }

  // 全部节点是否展示完毕
  isCompletedNodeSet (maxNumber = 1) {
    return this.getNodeCurrentStep() >= maxNumber
  }

  /**
   * 合并小球动画路线轨迹
   *
   * @param {*} [range=[]]
   * @return {*}
   */
  combineVirtualRoutes (range = []) {
    const id = `v-output-${uuidv4()}`
    const pathList = this.getPathListByNodesId(range)
    // TODO: 小球运动的节点路径
    // console.log(pathList.nodes())
    if (!pathList.node()) {
      return
    }

    this.flowchart.chartGroup.select(`#${id}`).remove()
    this.flowchart.chartGroup.append('g').attr('id', id)

    const _self = this
    let combineLine = ''

    pathList.each(function () {
      const [, sourceNodeId, targetNodeId] = d3
        .select(this)
        .attr('id')
        .split(_self.edgeIdSeparator)

      const nodeList = _self.getNodeList()
      // 首节点
      const sourceNode = _self.findNodeById(nodeList, sourceNodeId)
      // 尾节点
      const targetNode = _self.findNodeById(nodeList, targetNodeId)
      // 关联路径
      const pathNode = d3
        .select(this)
        .select('path')
        .node()

      // 获取 path 的首尾节点坐标
      const startPoint = pathNode.getPointAtLength(0)
      const endPoint = pathNode.getPointAtLength(pathNode.getTotalLength())

      const { x: sourceX, y: sourceY } = _self.getTranslateValues(sourceNode)
      const { x: targetX, y: targetY } = _self.getTranslateValues(targetNode)

      combineLine =
        combineLine +
        `
        M ${sourceX} ${sourceY}
        L ${startPoint.x} ${startPoint.y}
        ${d3.select(pathNode).attr('d')}
        M ${endPoint.x} ${endPoint.y}
        L ${targetX} ${targetY}
      `
    })

    const vGroup = this.flowchart.chartGroup
      .select(`#${id}`)
      .append('g')
      .attr('id', 'v-group')

    vGroup.append('path')
      .attr('id', 'moving-line')
      .attr('fill', 'none')
      .attr('d', combineLine)
      .node()
      .getTotalLength()

    return vGroup
  }

  /**
   * 创建轨迹小球动画
   *
   * @param {*} vGroup
   */
  createAnimationForVirtualRoutes (vGroup) {
    const translateAlong = function () {
      return function (d, i, a) {
        var tPath = d3.select(this.parentNode).select('path')
        return function (t) {
          var tPathNode = tPath.node()
          var l = tPathNode.getTotalLength()
          var p = tPathNode.getPointAtLength(t * l)
          return 'translate(' + p.x + ',' + p.y + ')'
        }
      }
    }

    Vue.nextTick(() => {
      vGroup
        .append('circle')
        .attr('fill', '#f24582')
        .attr('r', 10)
        .transition()
        .duration(5000)
        // .ease(d3.easeLinear)
        .attrTween('transform', translateAlong())
        // 或
        // .attrTween('transform', function () {
        //   const movingLine = vGroup.select('#moving-line').node()
        //   const len = movingLine.getTotalLength()
        //   return function (t) {
        //     const point = movingLine.getPointAtLength(len * t)
        //     return `translate(${point.x}, ${point.y})`
        //   }
        // })

        // TODO: .each("end", function() {...}) (version 3) seems to have been replaced by .on("end", ...) in version 5.
        .on('end', function () {
          this.remove()
          console.log('结束')
        })
    })
  }

  /**
   *  根据路径创建小球动画
   * @param {*} [range=[]]
   */
  createAnimationBallByRangeList (
    range = [],
    duration = 500 * range.length
  ) {
    const container = this.combineVirtualRoutes(range)
    if (!container) return

    const ball = new AnimationBall(
      container,
      duration
    )
    ball.play()
  }

  moveAnimationSequence (value = {}, rateTime) {
    const { activities, color, date } = value
    if (!activities || !activities.length) {
      return
    }

    this.animationDateSequenceGroup.set(date, new AnimationSequence())
    const { animationSequence: animationSequenceInstance } = this.animationDateSequenceGroup.get(date)

    animationSequenceInstance.stop()
    animationSequenceInstance.addSequence(
      ...activities.map(activity => {
        const container = this.combineVirtualRoutes([activity.source, activity.target])
        return container && new AnimationBall(
          container,
          activity.betweenTime * rateTime,
          color
        )
      })
    )

    animationSequenceInstance.play()
    return animationSequenceInstance
  }

  /**
   * 开始播放小球动画
   *
   * @param {*} date
   */
  playMoveAnimation ({ value, rateTime }) {
    this.moveAnimationSequence(value, rateTime)
  }

  changePlayMoveAnimation ({ value, rateTime }, isPlay) {
    let animationSequenceInstance = this.moveAnimationSequence(value, rateTime)
    if (!animationSequenceInstance) return

    if (isPlay) {
      animationSequenceInstance.play()
      animationSequenceInstance = this.moveAnimationSequence(value, rateTime)
    } else {
      animationSequenceInstance.pauseDynamic()
    }
  }

  /**
   * 暂停播放小球动画
   *
   */
  suspendMoveAnimation (date) {
  }
}

// 单个小球的播放动画
class AnimationBall {
  /**
   * Creates an instance of AnimationBall.
   * @param {*}  container 所属路径容器
   * @param {*}  duration 总运动持续时间
   */
  constructor (container, duration = 3000, color) {
    this.container = container
    this.duration = duration
    this.color = color || '#f24582'

    this.circle = null

    // 记录上一次暂停的时间点
    this.pauseValues = {
      lastT: 0,
      currentT: 0
    }
  }

  /**
   * 过渡函数
   *
   */
  transitionRun () {
    const _self = this
    const translateAlong = function () {
      return function () {
        const tPath = d3.select(this.parentNode).select('path')
        const tPathNode = tPath.node()
        if (!tPathNode) return
        const l = tPathNode.getTotalLength()
        return function (t) {
          // 接续上次暂停后的时间比率，以让小球保持之前的速率去运动
          t = (
            _self.pauseValues.lastT +
            (
              1 - _self.pauseValues.lastT
            ) * t
          )
          const p = tPathNode.getPointAtLength(t * l)
          _self.pauseValues.currentT = t
          return 'translate(' + p.x + ',' + p.y + ')'
        }
      }
    }

    Vue.nextTick(() => {
      if (!this.circle) {
        this.circle = this.container.append('circle')
      }
      this.circle
        .attr('fill', this.color)
        .attr('r', 8)
        .transition()
        .duration(
          this.duration - (
            this.duration * this.pauseValues.lastT
          )
        )
        .ease(d3.easeLinear)
        .attrTween('transform', translateAlong())
        .on('end', function () {
          _self.stop()
          console.log('已停止运动')
        })
    })
  }

  /**
   * 开始运动
   */
  play () {
    this.transitionRun()
  }

  /**
   * 暂停运动
   */
  pause () {
    const _self = this
    this.circle &&
    this.circle
      .transition()
      .duration(0)
      .on('end', function () {
        _self.pauseValues.lastT = _self.pauseValues.currentT
      })
  }

  /**
   * 停止运动
   */
  stop () {
    this.pauseValues = {
      lastT: 0,
      currentT: 0
    }
    this.circle &&
    this.circle
      .remove()
    d3.select(this.container.node().parentNode).remove()
    this.container.remove()
  }

  /**
   * 是否未结束运动
   *
   * @return {Boolean}
   */
  isNotOver () {
    return this.pauseValues.currentT < 1
  }
}

// 小球播放动画序列
class AnimationSequence {
  constructor () {
    this.sequence = []
  }

  // 插入序列
  addSequence (...animationBallInstanceList) {
    animationBallInstanceList = animationBallInstanceList.filter(
      animationBallInstance => animationBallInstance
    )
    this.sequence.push(...animationBallInstanceList)
    return this.sequence
  }

  // 开启播放序列动画
  play () {
    this.sequence.forEach(animationBallInstance => {
      Vue.nextTick(() => {
        animationBallInstance.play()
      })
    })
    return this.sequence
  }

  // 暂停播放序列动画
  pause () {
    this.sequence.forEach(animationBallInstance => {
      animationBallInstance.pause()
    })
    return this.sequence
  }

  pauseDynamic (curentDate) {
    this.sequence = this.sequence.filter(animationBallInstance => {
      const isNotOver = animationBallInstance.isNotOver()
      isNotOver && animationBallInstance.pause()
      return isNotOver
    })
  }

  // 停止所有小球动画
  stop () {
    this.sequence.forEach(animationBallInstance => {
      animationBallInstance.stop()
    })
    this.empty()
  }

  empty () {
    this.sequence = []
  }

  // 获取序列大小
  getSequenceSize () {
    return this.sequence.length
  }

  // 序列是否为空
  isEmpty () {
    return !this.sequence.length
  }
}

// 日期对应的动画序列组
class AnimationDateSequenceGroup {
  constructor () {
    this.sequence = []
  }

  /**
   * 插入对应日期下的动画序列
   *
   * @param {*} date 日期
   * @param {*} animationSequence 对应日期下的小球动画序列
   */
  set (date, animationSequence) {
    const isExist = this.isExist(date)

    if (!isExist) {
      this.sequence.push(this.structure(date, animationSequence))
    } else {
      this.removeNextAll(date)
    }
  }

  get (date) {
    return this
      .sequence.find(
        group => group.date === date
      )
  }

  structure (date, animationSequence) {
    return {
      date,
      animationSequence
    }
  }

  removeNextAll (date) {
    let currentDate = this.getRear().date

    while (date !== currentDate) {
      const oldGroup = this.sequence.pop()
      if (oldGroup) {
        const stopFn = oldGroup.animationSequence.stop
        isFunction(stopFn) && stopFn.call(oldGroup.animationSequence)
      }

      currentDate = this.getRear().date
    }
  }

  getRear () {
    return this.sequence[this.getSize() - 1] || {}
  }

  getSize () {
    return this.sequence.length
  }

  isExist (date) {
    return this
      .sequence.findIndex(
        group => group.date === date
      ) > -1
  }
}
