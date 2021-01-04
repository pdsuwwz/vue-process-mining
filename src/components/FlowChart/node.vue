<template>
  <div
    class="flow-chart-node"
    :class="getTypeClassName"
    @click="handleClick()"
  >
    <div
      class="flow-chart-node__icon"
    >
      <img :src="nodeSvg">
    </div>
    <div class="flow-chart-node__content">
      <p>{{ title }}</p>
      <p>{{ count }}</p>
    </div>
  </div>
</template>

<script>
import nodeSvg from '@/components/FlowChart/node-svg.svg'

export default {
  name: 'FlowChartNode',
  data () {
    return {
      title: 'Title',
      count: 20,
      type: '',
      icon: 'activity',
      nodeSvg
    }
  },
  computed: {
    getTypeClassName () {
      if (!this.type) return ''
      const typeList = ['plain', 'highlight']
      return typeList.includes(this.type) && this.type
    }
  },
  methods: {
    handleClick () {
      alert(this.title)
    }
  }
}
</script>

<style lang="scss" scoped>
$--color-primary: red;
$color: blue;
$--primary-hue-color: round(hue($--color-primary));

.flow-chart-node {
  display: flex;
  align-items: center;
  height: 36px;
  border: 1px solid $--color-primary;
  background-color: $--color-primary;
  border-radius: 6px;
  padding: 4px 10px;
  color: #fff;
  cursor: pointer;
  &.plain {
    color: #303133;
    background-color: #fff;
    .flow-chart-node__icon {
      color: $--color-primary;
    }
  }
  &.highlight {
    $color: hsl($--primary-hue-color + 57, 52%, 62%);
    background-color: $color;
    border: 1px solid $color;
  }
  .flow-chart-node__icon {
    width: 20px;
    height: 20px;
    font-size: 20px;
    & > img {
      width: 100%;
    }
  }
  .flow-chart-node__content {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    margin-left: 4px;
  }
}
</style>
