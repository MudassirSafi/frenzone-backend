class ApiFeatures {
  constructor(mongooseQuery, queryString) {
    this.mongooseQuery = mongooseQuery;
    this.queryString = queryString;
  }

  //1-Pagination
  pagination() {
    const PAGE_LIMIT = this.queryString.limit * 1 || 10;
    let PAGE_NUMBER = this.queryString.page * 1 || 1;
    if (this.queryString.page <= 0) PAGE_NUMBER = 1;
    const PAGE_SKIP = (PAGE_NUMBER - 1) * PAGE_LIMIT; //2*3

    this.mongooseQuery.skip(PAGE_SKIP);
    if(this.queryString.limit){
      this.mongooseQuery.limit(PAGE_LIMIT)
    }
    return this;
  }

  //2-Filteration

  filteration() {
    let filterObj = { ...this.queryString };
    // console.log(filterObj);

    let excludedQuery = ["page", "sort", "fields", "keyword", "limit"];

    excludedQuery.forEach((ele) => {
      delete filterObj[ele];
    });
    filterObj = JSON.stringify(filterObj);
    // console.log(filterObj);

    filterObj = filterObj.replace(
      /\b(gt|gte|lt|lte)\b/g,
      (match) => `$${match}`
    );
    filterObj = JSON.parse(filterObj);

    this.mongooseQuery.find(filterObj);
    return this;
  }
  //3-Sort
  sort(sortedBy = null) {
    if(sortedBy){
      this.mongooseQuery.sort(sortedBy);
    }else if(this.queryString.sort) {
      // console.log(req.query.sort);
      let sortedBy = this.queryString.sort.split(",").join(" ");
      // console.log(sortedBy);
      this.mongooseQuery.sort(sortedBy);
    }
    return this;
  }
  //4-Search

  search() {
    if (this.queryString.keyword) {
      // console.log(this.queryString.keyword);

      this.mongooseQuery.find({
        $or: [
          { username: { $regex: this.queryString.keyword, $options: "i" } },
          { description: { $regex: this.queryString.keyword, $options: "i" } },
          { firstname: { $regex: this.queryString.keyword, $options: "i" } },
          { lastname: { $regex: this.queryString.keyword, $options: "i" } },
        ],
      });
    }
    return this;
  }

  //4-Fields

  fields() {
    if (this.queryString.fields) {
      // console.log(this.queryString.fields);
      let fields = this.queryString.fields.split(",").join(" ");
      console.log(fields);
      // this.mongooseQuery.select(fields);
    }
    return this;
  }

  async getTotalCount() {
    const countQuery = this.mongooseQuery.model.find(this.mongooseQuery.getFilter());
    return await countQuery.countDocuments();
  }
}

module.exports = {ApiFeatures}