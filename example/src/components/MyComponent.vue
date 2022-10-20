<template>
  <div
    class="my-component-container"
  >
    <svg
      ref="container"
    ></svg>
  </div>
</template>

<script>
import FlowChartFactory from '@/components/FlowChart/factory'

const startNode = { id: 'start', label: '流程开始', shape: 'circle', type: 'plain', icon: 'start' }
const endNode = { id: 'end', label: '流程结束', shape: 'circle', isEnd: true, type: 'plain', icon: 'end' }
const nodeDataSetFirsrt = {
  reuseRate: '82.5',
  nodes: [
    startNode,
    endNode,
    { id: 'A', label: 'A', count: 200 },
    { id: 'B', label: 'B' },
    { id: 'C', label: 'C' }
  ],
  edges: [
    { source: 'start', target: 'A', label: '10' },
    { source: 'A', target: 'B', label: '99' },
    { source: 'B', target: 'C', label: '100' },
    { source: 'C', target: 'end', label: '123' }
  ]
}
export default {
  name: 'MyComponent',
  mounted () {
    this.$nextTick(() => {
      this.chartInstance = new FlowChartFactory(
        nodeDataSetFirsrt,
        this.$refs.container
      )
    })
  }
}
</script>

<style lang="scss" scoped>
.my-component-container {
  width: 100vw;
  height: 50vh;
}
</style>
