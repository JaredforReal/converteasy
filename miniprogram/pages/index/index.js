// pages/index/index.js
Page({

  /**
   * 页面的初始数据
   */
  data: {
    categories: [
      {
        id: 'document',
        name: '文档转换',
        icon: '📄',
        description: 'PDF、Word、Excel、PPT等格式互转',
        url: '/pages/document/document'
      },
      {
        id: 'audio',
        name: '音频转换', 
        icon: '🎵',
        description: 'MP3、WAV、AAC、FLAC等格式互转',
        url: '/pages/audio/audio'
      }
    ]
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {

  },

  navigateToCategory(e) {
    const url = e.currentTarget.dataset.url;
    wx.navigateTo({
      url: url
    });
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: '全能格式转换工具',
      path: '/pages/index/index'
    }
  }
})