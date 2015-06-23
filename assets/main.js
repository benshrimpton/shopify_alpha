//overriding the Array prototype. 
Array.prototype.contains = function(obj){
	var i = this.length; 
	while(i--){
		if (this[i] === obj) 
			return true;
	}
	return false;
};


if ( (typeof Shoper) === 'undefined')
	Shoper = {};

Shoper.max_allowed_to_cart = 10;
Shoper.variants_options = null;
Shoper.product_data = null;
Shoper.embroidery_handle = "embroidery";
Shoper.embroidery_variant_id = null;
Shoper.embroidery_size = 0;
Shoper.items = [];
Shoper.current_variant_id_on_product = null;
Shoper.productJSON = null;
Shoper.thumbNailsSize = null;
Shoper.products = null;

// Overriden methods 
/**
 * Get Cart in JSON
 * @param  {Function} callback [description]
 */
Shopify.getCart = function(callback) {
	jQuery.getJSON('/cart.js', function (cart, textStatus) {

		filterCart(cart);
		keepTrackQuantity(cart, function(){
			syncQuantityOptionsOnProduct({ cart : cart });
			if ((typeof callback) === 'function') {
				callback(cart);
			}
			else {
				Shopify.onCartUpdate(cart);
			}
		});


	});
};


/**
 * Print out nicer message
 */
Shopify.onError = function(XMLHttpRequest, textStatus) {
  // Shopify returns a description of the error in XMLHttpRequest.responseText.
  // It is JSON.
  // Example: {"description":"The product 'Amelia - Small' is already sold out.","status":500,"message":"Cart Error"}
  var data = eval('(' + XMLHttpRequest.responseText + ')');
  if (!!data.message) {
    alert(data.description);
  } else {
    alert('Error : ' + Shopify.fullMessagesFromErrors(data).join('; ') + '.');
  }
};

/**
 * This function will be triggered whenever there's a manipulation in the cart
 * @param  {JSON} cart Cart 
 */
Shopify.onCartUpdate = function(cart){

	filterCart(cart);
	keepTrackQuantity(cart, function(){
		if ( cart.item_count === 0 ) {
			showEmptyCartMessage();
		} else {
			$('.cart-total .total').text(Shopify.formatMoney(cart.total_price));
		}
		syncQuantityOptionsOnProduct({ cart : cart });
		updateCartQuantity(cart.item_count);
		Shoper.renderMiniCart(cart);
		Shoper.renderCart(cart);
	});

};

/**
 * 
 * This function will be triggered whenever an item is added into the cart
 * @param  {JSON} line_item recently added line_item
 */
Shopify.onItemAdded = function(line_item, added_quantity){
  
	if( line_item.properties ) {;
		if ( ! Shoper.embroidery_variant_id ) {
			Shopify.getProduct(Shoper.embroidery_handle, function(product){
				Shoper.embroidery_variant_id = product.variants[0].id; // assuming there's only one variant for the embroidery product
				Shopify.addItem(Shoper.embroidery_variant_id, added_quantity);
			});
		} else {
			Shopify.addItem(Shoper.embroidery_variant_id, added_quantity);
		}
	} else {
		Shopify.getCart(function(cart){
              Shoper.renderMiniCart(cart);
              toggleMiniCart();
              updateCartQuantity(cart.item_count);
		});
	}

}

/**
 * 
 * Add item from a form in a form format 
 * @param {String} form_id DOM ID 
 * @param {function | undefined} [callback] 
 */
Shopify.addItemFromForm = function(form_id, callback) {
    
    var formDOM = ( form_id instanceof $ ) ? form_id : $('#' + form_id);
    var added_quantity = formDOM.find('[name="quantity"]').val();
  	
    var serializedData = formDOM.serialize();
  	
    if ( formDOM.find('[name="properties[hasEmbroidery]"]').val() === 'false' ) {
		var splittedData = serializedData.split('&');
      	serializedData = "";
        splittedData.forEach(function(data){
          if ( data.search('properties') === -1 ){
          	serializedData = serializedData +"&"+ data;
          }
        });
    }
  
  
    var params = {
      type: 'POST',
      url: '/cart/add.js',
      data: serializedData,
      dataType: 'json',
      success: function(line_item) {
        if ((typeof callback) === 'function') {
          callback(line_item);
        }
        else {
          
          if ( line_item.properties && line_item.properties.hasEmbroidery === 'false' ) {
          	line_item.properties = null;

          }
          
          Shopify.onItemAdded(line_item, added_quantity);
        }
      },
      error: function(XMLHttpRequest, textStatus) {
        Shopify.onError(XMLHttpRequest, textStatus);
      }
    };

    $.ajax(params);
};

/**
 *
 * To retrieve all available products
 * @param  {Function | undefined} cb 
 * @return {JSON} Product
 */
Shopify.getAllProduct = function(cb){
	$.getJSON('/products.json', function(products, textStatus){
		if( (typeof cb) === 'function' )
			cb(products);
		else
			return products;
	});
};

/**
 * 
 * Get product using handle.json instead of handle.js
 * @param  {String}   handle Product handle name
 * @param  {Function} cb     
 */
Shopify.getProductInJSON = function(handle, cb){
	$.getJSON('/products/'+handle+'.json', function(obj, textStatus){
		if ( (typeof cb) === 'function' ){
			cb(obj.product);
		}
		else {
			Shopify.onProduct(obj.product);
		}
	});
};



/**
* Change item 
* @param {JSON} data {properties : properties, quantity : quantity}
* @param {Function} callback
*/
Shopify.changeItemByLine = function(data, callback) {
  var params = {
    type: 'POST',
    url: '/cart/change.js',
    data: {
      line : data.line, 
      quantity : data.quantity
    },
    dataType: 'json',
    success: function(cart) {
      if ((typeof callback) === 'function') {
        callback(cart);
      }
      else {
        Shopify.onCartUpdate(cart);
      }
    },
    error: function(XMLHttpRequest, textStatus) {
      Shopify.onError(XMLHttpRequest, textStatus);
    }
  };
  jQuery.ajax(params);
};

/**
 * Render out template to targeted DOM
 * @param  {JSON} params It needs to be passed in as following format : 
 * {
 * 	selector : DOM ID where to retrieve the template
 * 	target : DOM ID where to render to
 * 	data : JSON 
 * }
 */
Shoper.render = function(params){
	params.selector = (params.selector.charAt(0) === '#') ? params.selector : '#'+params.selector;
	params.target = (params.target.charAt(0) === '#') ? params.target : '#'+params.target;
	var template = $(params.selector).html();
	var compiledTemplate = Hogan.compile(template,{delimiters: '<% %>'});
	var rendered = compiledTemplate.render(params.data);
	var isAnimated = ( (typeof params.isAnimated) === 'undefined'  ) ? true : params.isAnimated;
	if ( isAnimated ) {
		$(params.target).fadeOut(params.animationPeriod, function(){
			$(params.target).empty();
			$(params.target).html(rendered).fadeIn(params.animationPeriod);
		});
	} else {
		$(params.target).empty();
		$(params.target).html(rendered);
	}
};

/**
 * To restruct the variants in the product JSON so that it can be render out easily
 *
 * If there is an image associated with the variant, the option1 must be the variant option associated with the variant image
 * 
 * @param  {JSON} obj The product JSON
 */
Shoper.restrucVariant = function(obj){
	var variants = obj.variants;
	var option1 = []; 
	var option2 = []; 
	var option3 = [];
	variants.forEach(function(variant){
		if ( isExisted(option1, variant.option1, 'option') === -1 ) {
			var thumbIndex = getThumbIndex(variant.id);
			option1.push({
				image : ( variant.featured_image ) ? Shopify.resizeImage(Shoper.productJSON.images[thumbIndex].src, 'small') : null,
				option : variant.option1, 
				id : variant.id
			});
		}	
		if ( $.inArray(variant.option2, option2) === -1 )
			option2.push(variant.option2);
		if ( $.inArray(variant.option3, option3) === -1 )
			option3.push(variant.option3);
	});
	return  {
		optionName1 : obj.options[0], 
		optionName2 : obj.options[1],
		optionName3 : obj.options[2], 
		option1 : option1, 
		option2 : option2, 
		option3 : option3 
	}
};

/**
 * Render out variants 
 *
 * Beware with the DOM IDs listed in the function
 */
Shoper.renderVariants = function(){
	Shoper.product_data = JSON.parse($('#product-data').html());
	Shoper.variants_options = Shoper.restrucVariant(Shoper.product_data);
	Shoper.render({
		selector : "#template-product-variants", 
		target : "#product-variants-target", 
		data : Shoper.variants_options, 
		isAnimated : false, 
		animationPeriod : 300
	});
}

/**
 * Render out mini cart
 *
 * Beware with the DOM IDs listed in the function
 *  */
Shoper.renderMiniCart = function(cart){

	if ( $('#mini-cart-target').length ) {
      
		var cart = JSON.parse(JSON.stringify(cart));
		
		cart.items.map(function(item){
			item.image = Shopify.resizeImage(item.image, 'small');
			item.line_price = Shopify.formatMoney(item.line_price);
			if (item.embroidery_price)
				item.embroidery_price = Shopify.formatMoney(item.embroidery_price);
		});
      
		cart.total_price = Shopify.formatMoney(cart.total_price);
      	
		Shoper.render({
			selector : "#template-mini-cart", 
			target : "#mini-cart-target",
			data : cart, 
			isAnimated : false, 
			animationPeriod : 300
		});

		setTimeout(updateItemQuantity, 350);
		//updateItemQuantity();
	}
  
};

Shoper.renderCart = function(cart){
	
	if ( $('#cart-target').length ) {
		var cart = JSON.parse(JSON.stringify(cart));

		cart.total_price = Shopify.formatMoney(cart.total_price);

		cart.items.map(function(item){
			item.image = Shopify.resizeImage(item.image, 'small');
			item.line_price = Shopify.formatMoney(item.line_price);
			if (item.embroidery_price)
				item.embroidery_price = Shopify.formatMoney(item.embroidery_price);
		});

		Shoper.render({
			selector : "#template-cart", 
			target : "#cart-target", 
			data : cart, 
			isAnimated : false, 
			animationPeriod : 300
		});

		updateItemQuantity();
	}

};

/**
 * Render out quick view 
 *
 * Beware with the DOM IDs listed in the function
 */
Shoper.renderQuickView = function(handle){
	Shopify.getProduct(handle, function(selectedProduct){
		selectedProduct.featured_image = Shopify.resizeImage(selectedProduct.featured_image,  'small');
		Shoper.render({
			selector : "#template-quickview", 
			target : "#quickview-target", 
			data : selectedProduct, 
			isAnimated : false, 
			animationPeriod : 300
		});
		new Shopify.OptionSelectors('product-variant-select', { product : selectedProduct, onVariantSelected: selectCallback });
		updateItemQuantity();
	});
};

/**
 * Render out Embroidery 
 *
 * Beware with the DOM IDs listed in the function
 * */
Shoper.renderEmbroidery = function(obj){
	var data = ((typeof obj === 'undefined')) ? null : obj;
	Shoper.render({
		selector : "#template-embroidery", 
		target : "#embroidery-target", 
		data : data, 
		isAnimated : false, 
		animationPeriod : 300
	});
}

/**
 * Generate options for quantity selector 
 * @param  {Number} size Number of options
 * @param  {Number} selectedIndex Selected option
 */
Shoper.generateQuantityOptions = function(size, selectedIndex){
  
	var defaultOption = Hogan.compile("<option value='<%index%>' ><%index%></option>", {delimiters: '<% %>'});
	var selectedOption = Hogan.compile("<option value='<%index%>' selected='selected' ><%index%></option>", {delimiters: '<% %>'});
	var rendered = '';
	
  	for(var i = 1; i <= size; i ++){
		if ( selectedIndex && selectedIndex == i )
			rendered = rendered + selectedOption.render({ index : i });
		else
			rendered = rendered + defaultOption.render({ index : i });
	}
	
  	return rendered;
};

/**
 * To retrieve the specific variant from the object
 * @param  {JSON} params { variants : product variants , id : id to search for } 
 * @return {Number}
 */
Shoper.getVariant = function(params){
	var i; 
	for(i = 0; i < params.variants.length; i++) {
		if ( params.variants[i].id == params.id ){
			return params.variants[i];
		} 
	}
	return null;
};	


//Jquery Event
$('body').on('submit', '#product-add-item-form, #quickview-add-item-form', function(e){
	e.preventDefault();
	Shopify.addItemFromForm($(this));
});

$('body').on('click', '.quick-shop', function(e){
	e.stopPropagation();
	var handle = $(this).data('handle');
	Shoper.renderQuickView(handle);
	$('#quickview-target').modal('show');

});

$('body').on('click', '#quickview-target .close', function(e){
	$('#quickview-target').modal('hide');
});

$('body').on('click', '.cart-remove, .mini-cart-remove', function(e){
	
	e.preventDefault();
	
	var self = $(this);
	var variantId = $(this).data('variantid'); 
  	var lineNum = $(this).data('line');
	var cartItemRow = self.closest('.cart-item-row');
	var thisEmbroiderySize = $(this).data('quantity') || 0;
	var embroideryReducedSize = Shoper.embroidery_size - $(this).data('quantity');
	embroideryReducedSize = (embroideryReducedSize > 0) ? embroideryReducedSize : 0; 
	var hasembroidery =  $(this).data('hasembroidery');

	if (cartItemRow) {
		cartItemRow.empty();
		if(cartItemRow.length === 0){
			showEmptyCartMessage()
		}
	}
  
    Shopify.changeItemByLine({ line : lineNum, quantity : 0}, function(cart){
      if ( hasembroidery ) {
        Shopify.changeItem(Shoper.embroidery_variant_id, embroideryReducedSize);
      } else {
        Shopify.onCartUpdate(cart);
      }
    });
  

});

$('body').on('click', '#cart-empty-btn', function(e){
	e.preventDefault();
	Shopify.clear();
});

$('body').on('change', '[data-listener="variants"]', function(e){
	updateQuantityAndPrice();
});

$('body').on('change', 'select.item-quantity',function(e){
	
  	var self = $(this);
	var variant_id = self.data('itemid');
  	var lineNum = self.data('line');
	var quantity = self.val();
	var hasembroidery = self.data('hasembroidery');
  
	if ( hasembroidery ) {
		var originalQuantity = $(this).data('originalquantity');
		Shoper.embroidery_size = Shoper.embroidery_size + (quantity - originalQuantity);
		Shopify.changeItem(Shoper.embroidery_variant_id, Shoper.embroidery_size, function(cart){
          Shopify.changeItemByLine({ line : lineNum, quantity : quantity}, function(cart){
            Shopify.onCartUpdate(cart);
          });
		});
	} else {
		//Shopify.changeItem(variant_id, quantity);
      	Shopify.changeItemByLine({ line : lineNum, quantity : quantity}, function(cart){
          Shopify.onCartUpdate(cart);
        });
	} 
  
});

$('body').on('click', '.product-option a', function(e){
	e.preventDefault();
	var self = $(this);
	self.each(function(){
		var elem = $(this);
		var optionValue = elem.data('option-value');
		var optionPosition = elem.closest('.product-option').data('option-position');
		$('#product-variant-select-option-'+ optionPosition).val(optionValue).change();
	});
	if ( self.closest('[data-variant-image="true"]') ) {
		var variant_id = self.data('variant-id');

        var originalImage = $(".featured-image-div img");
        var newImage = getAssociatedImage(variant_id);
        var element = originalImage[0];
        Shopify.Image.switchImage(newImage, element, function (newImageSizedSrc, newImage, element) {
            $(element).parents('a').attr('href', newImageSizedSrc);
            $(element).attr('src', newImageSizedSrc);
        });
	}
});


$('body').on('change', '#product-variant-select', function(e){
	alert();
	alert($('#product-variant-select').val());
});

//To toggle where the embroidery is needed.
$('body').on('change', '#embroideryNeeded', function(e){
  if( $(this).is(':checked') ) {
	$('[name="properties[hasEmbroidery]"]').val('true');
  } else {
    $('[name="properties[hasEmbroidery]"]').val('false');
  }
});

//Toggle the mini cart
$('body').on('click', '.toggle-mini-cart', function(e){
  	e.preventDefault();
	toggleMiniCart();
});

//DEVELOPING
//Remove Selected and Add Selected into it.
//
// IMPORTANT class name (they need to be retained) : product-option-selected , product-option-out
$('body').on('change', '.single-option-selector', function(e){

	var variantTarget = $('#product-variants-target');

	if ( variantTarget.children().length ) {
		var option = $(this).data('option');
		option = option.charAt(option.length - 1);
		var value = $(this).val();

		var boxes = variantTarget.find("div[data-option='"+ option+"']").children('a');
		var selectedBox = variantTarget.find("div[data-option='"+ option+"'] a[data-option-value='"+value+"']");

		if(boxes){
			boxes.removeClass('product-option-selected');
			selectedBox.addClass('product-option-selected');
		} 
	}

});


//It is used to keep track whether the variant is clicked.
var optionsClicked = [false, false, false];

//DEVELOPING
//Cross out the product options
$('body').on('click', '#product-variants-target a', function(e){

	if ( optionsClicked[i] )
		return;

	e.preventDefault();
	var option = $(this).parent().data('option'); //option
	var data = $(this).data('option-value'); //data

	//var productJSON = JSON.parse($('#product-data').html());
	var variants = JSON.parse($('#product-data').html()).variants;

	var optionNum = [1,2,3];

	if ( $.inArray(option, optionNum) === -1){
		console.log('something is wrong with the option');
		return;
	} 

	if (optionsClicked[option-1])
		return; 

	optionNum.splice(option - 1, 1); //to obtain the options that needed to change

	for(var i = 0; i < optionNum.length; i++){
		var index = optionNum[i] - 1;
		optionsClicked[index] = true;
	}

	//obtain the corresponded available 
	var availableOptions = [];
	for(var i = 0; i < variants.length; i++){
		if ( variants[i].options[option - 1] === data ) {
			availableOptions.push(variants[i].options);
		}
	}
	
	//prefilled with sold out mark
	$('#product-variants-target .product-option a').removeClass('product-option-out').addClass('product-option-out');

	//remove option in the same category
	$(this).removeClass('product-option-out');
	$(this).siblings().removeClass('product-option-out');

	//cross out the sold-out section 
	//complexity of the following snippet of code is n^3 , any better solution 
	for(var i = 0; i < optionNum.length; i++){
		if (optionNum[i] === option) continue;
		var $options = $("#product-variants-target [data-option='"+optionNum[i]+"'] a");
		for(var j = 0; j < availableOptions.length; j++){
			for(var x = 0; x < $options.length; x++){
				if ( $options.eq(x).data('option-value') === availableOptions[j][optionNum[i]-1] ){
					$options.eq(x).removeClass('product-option-out');
				} else {
					/*
					Remove the selected class if there's one, reset the select down button
					 */
					if ( $options.eq(x).hasClass('product-option-selected') ) {
						$options.eq(x).removeClass('product-option-selected');
						$(".product-variants").find("#product-variant-select-option-"+(optionNum[i]-1)+" option:first").attr("selected", "selected");
					}
				}
			}
		}
	}



});


//PREVENT THE CLICK ON PRODUCT-OPTION-OUT FROM HAPPENING
$('#product-variants-target').on('click', '.product-option-out',function(){
	return false;
});


window.onload = function(){

    var i = 0, j = 0; 
  
    //render out the cart and mini-cart
	Shopify.getCart(function(cart){
      	Shoper.renderMiniCart(cart);
      	if ( $('#cart-target').length ) {
          Shoper.renderCart(cart);
    	} 
	});

	//update the quantity and price
	if( $('[data-listener="variants"]').length )
		updateQuantityAndPrice();

	//split the default variant option into multiple variant options
	//when you are on the product page
    if ( $('#product-variant-select').length ){
        var productJSON = JSON.parse($('#product-data').html());

        Shopify.getProductInJSON(productJSON.handle, function(product){
        	
        	Shoper.productJSON = product;
        	setThumbNailsSize(); //Shoper.productJSON cannot be null

	        new Shopify.OptionSelectors(
	            'product-variant-select', 
	            { 
	                product : productJSON,
	                onVariantSelected: selectCallback
	            });

	        var foundOneInStock = false;
	        //$('.single-option-selector').trigger('change');
	        for(i = 0; i < productJSON.variants.length; i++ ){
	        	if ( productJSON.variants[i].available && foundOneInStock === false ) {
	        		foundOneInStock = true;
	        		for(j = 0; j < productJSON.variants[i].options.length; j++){
	        			//$('.single-option-selector:eq('+j+')').val(productJSON.variants[i].options[j]).trigger('change');
	        		}
	        	}
	        }

    		Shoper.renderVariants();
          	//$('.single-option-selector').trigger('change');
        });
    }
};




/**
 * HELPER FUNCTIONS 
 */

//toggle to open mini cart
function toggleMiniCart(){
	$('#mini-cart-target').toggleClass('open');
}

/**
 * 
 * To be triggered by the option_selector
 * @param  {JSON} variant
 * @param  {Object} selector 
 */
var selectCallback = function(variant, selector){

	var addToCartButton = '#product-add-to-cart';

	if (variant) {

		Shoper.current_variant_id_on_product = variant.id;

		if (variant.available) {
		  $(addToCartButton).removeClass('disabled').removeAttr('disabled').val('Add to Cart').fadeTo(200,1);
		} else {
		  $(addToCartButton).val('Sold Out').addClass('disabled').attr('disabled', 'disabled').fadeTo(200,0.5);        
		}

		if ( variant.compare_at_price > variant.price ) {
		  $('.product-variant-price-wrapper').html('<span class="product-variant-price on-sale">'+ Shopify.formatMoney(variant.price, "") +'</span>'+'&nbsp;<s class="product-compare-price">'+Shopify.formatMoney(variant.compare_at_price, "")+ '</s>');
		} else {
		  $('.product-variant-price-wrapper').html('<span class="product-variant-price">'+ Shopify.formatMoney(variant.price, "") + '</span>' );
		}
      
      	//disable the button when the product is added into it successfully.
      	//write code here.
      
		syncQuantityOptionsOnProduct({variant : variant}); 

	} else {
		$(addToCartButton).val('Unavailable').addClass('disabled').attr('disabled', 'disabled').fadeTo(200,0.5);
	}

	if (variant && variant.featured_image) {
        var originalImage = $(".featured-image-div img");
        var newImage = getAssociatedImage(variant.id);
        var element = originalImage[0];
        Shopify.Image.switchImage(newImage, element, function (newImageSizedSrc, newImage, element) {
            $(element).parents('a').attr('href', newImageSizedSrc);
            $(element).attr('src', newImageSizedSrc);
        });
    }
  
};

/**
 * Obtain the associated image
 */
function getAssociatedImage(associated_id){
	if ( ! Shoper.productJSON ) 
		return null;
	var images = Shoper.productJSON.images; 
	var index = getThumbIndex(associated_id);
	return images[index-Shoper.thumbNailsSize];
};

/**
 * Obtain the index to the thumb
 */
function getThumbIndex(id){
	var images = Shoper.productJSON.images; 
	var index = 0; 
	for(var i = 0; i < images.length; i++){
		for(var j = 0; j < images[i].variant_ids.length; j++){
			if ( images[i].variant_ids[j] === id ){
				index = i;
			}
		}
	}
	return index;
};

/**
 * To set thumbnail size. 
 */
function setThumbNailsSize(){
	var images = Shoper.productJSON.images; 
	Shoper.thumbNailsSize = 0;
	for(var i = 0; i < images.length; i++){
		if( images[i].variant_ids.length )
			Shoper.thumbNailsSize++;
	}
}


/**
 *
 * May need to remove this part and replace it with another function
 * 
 * Sync the quantity options on the product
 * @param  {Number} variantID The variant ID
 */
function syncQuantityOptionsOnProduct(obj){

	var variant = obj.variant;
	var cart = obj.cart;

  	/**
    {
    	variant_id : id, 
        quantity : quantity, 
        inventory_quantity : inventory_quantity
    }
    */
  
	if ( $('#product').length || $('#quickview-target').length   ) {
            
      //Obtain the correct resutl 
      //Refactor for better performance.
      //
      //Need for cart and mini-cart
      //update mini-cart and cart
      var variantID = (variant) ? variant.id : Shoper.current_variant_id_on_product;
      var itemQuantityInCart = getItemQuantityInCart(variantID);
      var quantity =  Shoper.max_allowed_to_cart - itemQuantityInCart;
      
      if ( $('#product-variant-quantity').length ) {
      	//targeting product 
        Shopify.getProduct( $('#product-variant-quantity').data('producthandle'), function(product){
          var selectedVariantId = $('#product-variant-select').val();
          var variantQty = 0;
          for(var i = 0; i < product.variants.length; i++){
            if( product.variants[i].id == selectedVariantId ){
              variantQty = product.variants[i].inventory_quantity;
              break;
            }
          }    

          if ( variantQty >= Shoper.max_allowed_to_cart ) {
          	quantity = Shoper.max_allowed_to_cart - itemQuantityInCart;
          } else {
          	quantity = variantQty - itemQuantityInCart;
          }
          
          $('#product-variant-quantity').empty();
          $('#product-variant-quantity').html( Shoper.generateQuantityOptions(quantity) );
          
          //remove the add to cart button 
          if (quantity <= 0) {
              $('#product-add-to-cart').val('Unavailable').addClass('disabled').attr('disabled', 'disabled').fadeTo(200,0.5);
          } else {
              $('#product-add-to-cart').removeClass('disabled').removeAttr('disabled').val('Add to Cart').fadeTo(200,1);
          }

          if ( variant && !variant.available )
              $('#product-add-to-cart').val('Sold Out').addClass('disabled').attr('disabled', 'disabled').fadeTo(200,0.5);
          
        });
      }
      
	}
  
//   	var $itemsInCart = $(document).find('.item-quantity');
//     for(var i = 0; $itemsInCart.length; i++){
//       var $item = $itemsInCart.get(i);
//     } 
}



/**
 * 
 * Get the Item Quantity currently in the cart
 * @param  {Number} variantID The ID of the variant
 */
function getItemQuantityInCart(variantID){
	var i; 
	for(i = 0; i < Shoper.items.length; i++){
      if (Shoper.items[i].id == variantID){
        return  Shoper.items[i].quantity;
      }
	}
	return 0;
};


/**
 * Filter cart from the embroidery and restructure data to the correct ID
 * @param  {JSON} cart 
 */
function filterCart(cart, cb){
	
	var embroidery_size = 0, embroidery_line_price = 0;
	//remove embroidery from the cart
  
    for(var i = 0; i < cart.items.length; i++){
      cart.items[i].line = i + 1;
    }
  
  	//assuming there is only one embroidery product in the shopify
	for(var i = 0; i < cart.items.length; i++){
		if ( cart.items[i].handle === Shoper.embroidery_handle ) {
			Shoper.embroidery_size = cart.items[i].quantity; 
			embroidery_size = cart.items[i].quantity;
			Shoper.embroidery_variant_id = cart.items[i].id;
			embroidery_line_price = cart.items[i].price;
			cart.items.splice(i, 1);
        } 
	}

	for(var i = 0; i < cart.items.length; i++){
		cart.items[i].embroidery_price = ( cart.items[i].properties ) ? cart.items[i].quantity * embroidery_line_price : null; 
	}
  
	cart.item_count = cart.item_count - embroidery_size;
  
  	if ( (typeof cb) === "function")
      	return cb(cart);
  	else
  		return cart;
}

/**
 * 
 * It is to keep track of the quantity
 * @param  {[type]}   cart [description]
 * @param  {Function} cb   [description]
 */
function keepTrackQuantity(cart, cb){
	
  	var i; 	
  	
  	//pop it out
	while(Shoper.items.length > 0){
		Shoper.items.pop();
	}
  
  	var found = false;
  
    for(var i = 0; i < cart.items.length; i++){
      for(var j = 0; j < Shoper.items.length; j++){
        if ( Shoper.items[j].id === cart.items[i].id ) {
        	Shoper.items[j].quantity = Shoper.items[j].quantity + cart.items[i].quantity;
          	found = true;
        }
      }
      if (!found) 
        Shoper.items.push({ "id" : cart.items[i].id, "handle" : cart.items[i].handle, "quantity" : cart.items[i].quantity });
      found = false;
    }
  
	return cb();
};


/**
 * 
 * Update the quantity and price in mini-cart, product , and cart
 * @param  {Object} obj DOM
 */
function updateQuantityAndPrice(obj){
	
  	var self = ( obj instanceof $ ) ? obj : $('[data-listener="variants"]');	
	var productHandle = self.data('producthandle');
	var variantId = self.val();
	var variant; 
	
  	Shopify.getProduct(productHandle, function(product){
		variant = Shoper.getVariant({ id : variantId, variants : product.variants });
		var variantQuantity = (variant.inventory_quantity < Shoper.max_allowed_to_cart) ? variant.inventory_quantity : Shoper.max_allowed_to_cart;
		var variantPrice = Shopify.formatMoney(variant.price);
		$('[data-target="price"]').text(variantPrice);
	});
}

/**
 * 
 * Update the selected item quantity
 * @param  {JSON} params 
 */
function updateItemQuantity(params){
  
  $('body select.item-quantity').each(function(){
    
    var self = $(this);
    var variantId = self.data('variantid');
    var productHandle = self.data('producthandle');
    var selectedQuantity = self.val();
    
    updateCarts(productHandle, variantId, selectedQuantity, self, Shoper.max_allowed_to_cart);
    
  });
  
};

//this is not a good practice, need to refactor to perfom better
var updateCarts = function(product_handle, variant_id, value, obj, limit){

  var quantity_selector = ( typeof obj == 'string' || obj instanceof String ) ? $(obj) : obj;
  var quantity = parseInt(value);
  var size=0;
  var itemCartSize = 0;
  quantity_selector.find('option').remove();

  //count item in cart
  Shopify.getCart(function(cart){

    for(var i = 0; i < cart.items.length; i++){
      if (cart.items[i].product_handle === product_handle || cart.items[i].variant_id === variant_id) {
        itemCartSize = itemCartSize+cart.items[i].quantity;
      }
    }
    // cb(null, cart, size);
    // console.log(itemCartSize);
    //count item in product
    Shopify.getProduct(product_handle, function(product){

      for(var i = 0; i < product.variants.length; i++){
        if (product.variants[i].id === variant_id){
          size = product.variants[i].inventory_quantity;
          break;
        }
      }
      //awd

      size = (size > limit) ? limit : size;
      size=size-(itemCartSize-quantity);
      console.log("Size : " + size);

      for(var i = 0; i < size; i++){
        if ( (i+1) === quantity ) {
          quantity_selector.append('<option value="'+(i+1)+'"  selected="selected" >'+(i+1)+'</option>');
        } else {
          quantity_selector.append('<option value="'+(i+1)+'">'+(i+1)+'</option>');
        }
      }
    });
  });
};







/**
 * 
 * Update the quantity in the cart
 * @param  {Number} quantity The total quantity in the cart
 */
function updateCartQuantity(quantity){
  $('#cart-item-count').text(quantity);
}

/**
 * 
 * Display the empty cart message on the cart page=
 */
function showEmptyCartMessage(){
	var targetedDOM = '#cart';
	if ( $(targetedDOM).length ) {
		Shoper.render({
			selector : "#template-cart-empty-message", 
			target : targetedDOM, 
			data : null
		});
	}
}

/**
 *
 * Generate an array filled with number in order.
 * @param  {Numnber} start Starting point of the array
 * @param  {Number} stop Ending point of the array
 * @return {Array} 
 *
 * for example :
 * range(0, 3) //[0,1,2,3]
 */
function range(start, stop){
	var arr = [], i; 
	for(i = start; i <= stop; i++){
		arr.push(i);
	}
	return arr;
}

function isExisted(list, value, key){
	for(var i = 0; i < list.length; i++){
		if ( list[i][key] === value )
			return i;
	}
	return -1;
}
