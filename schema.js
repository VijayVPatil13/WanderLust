const Joi = require("joi");

const listingSchema = Joi.object({
  listing: Joi.object({
    title: Joi.string().required(),
    description: Joi.string().required(),
    price: Joi.number().min(0).required(),
    location: Joi.string().required(),
    country: Joi.string().required(),
    image: Joi.string().uri().allow("", null)
  }).required()
});

const reviewSchema = Joi.object({
  review: Joi.object({
    rating: Joi.number().min(1).max(5).required()
      .messages({
        "number.base": "Rating must be a number",
        "number.min": "Rating must be at least 1",
        "number.max": "Rating cannot exceed 5",
        "any.required": "Rating is required"
      }),

    comment: Joi.string().min(1).required()
      .messages({
        "string.empty": "Comment cannot be empty",
        "any.required": "Comment is required"
      })
  }).required()
});

module.exports = {listingSchema, reviewSchema};