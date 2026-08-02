(function () {
  'use strict';

  /**
   * @typedef {{id:string,displayName:string,avatarUrl:string|null,bio:string|null,createdAt:string}} CommunityUser
   * @typedef {{id:string,userId:string,author:CommunityUser,content:string,images:string[],commentCount:number,createdAt:string,updatedAt:string}} CommunityPost
   * @typedef {{id:string,postId:string,userId:string,author:CommunityUser,content:string,createdAt:string}} CommunityComment
   * @typedef {'pattern'|'strategy'} MarketplaceListingType
   * @typedef {'draft'|'published'|'delisted'} MarketplaceListingStatus
   * @typedef {{id:string,sellerId:string,type:MarketplaceListingType,sourceId:string,title:string,description:string,priceAmount:number,priceCurrency:string,successRatePercent:number|null,sampleSize:number,evidenceAsOf:string,previewContent:object,fullContent:object|null,screenshots:string[],status:MarketplaceListingStatus,createdAt:string,updatedAt:string}} MarketplaceListing
   * @typedef {{id:string,listingId:string,buyerId:string,purchasedAt:string,priceAtPurchase:number,mock:true}} MarketplacePurchase
   * @typedef {{id:string,listingId:string,buyerId:string,rating:number,reviewText:string|null,createdAt:string}} MarketplaceRating
   * @typedef {{id:string,listingId:string,buyerId:string,sellerId:string,createdAt:string}} DmThread
   * @typedef {{id:string,threadId:string,senderId:string,content:string,createdAt:string,readAt:string|null}} DmMessage
   * @typedef {'post'|'comment'|'listing'|'message'} ReportTargetType
   */

  window.TradeJournalCommunityTypes = {
    listingTypes: ['pattern', 'strategy'],
    listingStatuses: ['draft', 'published', 'delisted'],
    reportTargetTypes: ['post', 'comment', 'listing', 'message'],
    priceCurrencies: ['USD', 'EUR']
  };
}());
